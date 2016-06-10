'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _xstream = require('xstream');

var _xstream2 = _interopRequireDefault(_xstream);

var _dropRepeats = require('xstream/extra/dropRepeats');

var _dropRepeats2 = _interopRequireDefault(_dropRepeats);

var _isolate = require('@cycle/isolate');

var _isolate2 = _interopRequireDefault(_isolate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var _id = 0;

function id() {
  return _id++;
}

function handlerStreams(component, item) {
  var handlers = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  var sinkStreams = Object.keys(item).map(function (sink) {
    if (handlers[sink] === undefined) {
      return null;
    }

    var handler = handlers[sink];
    var sink$ = item[sink];

    return sink$.map(function (event) {
      event && event.stopPropagation && event.stopPropagation();

      var handlerReducer = function handlerReducer(state) {
        return handler(state, item, event);
      };

      return handlerReducer;
    });
  });

  return _xstream2.default.merge.apply(_xstream2.default, _toConsumableArray(sinkStreams.filter(function (reducer) {
    return reducer !== null;
  })));
}

function makeItem(component, sources, props) {
  var newId = id();

  var newItem = (0, _isolate2.default)(component, newId.toString())(sources);

  newItem.id = newId;
  newItem.name = component.name;

  return newItem;
}

function collection(options) {
  var items = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];
  var handler$Hash = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];
  var component = options.component;
  var sources = options.sources;
  var handlers = options.handlers;
  var reducers = options.reducers;
  var proxy = options.proxy;


  return {
    add: function add() {
      var additionalSources = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var newItem = makeItem(component, _extends({}, sources, additionalSources));
      var handler$ = handlerStreams(component, newItem, handlers);
      handler$.addListener(proxy);

      return collection(options, [].concat(_toConsumableArray(items), [newItem]), _extends({}, handler$Hash, _defineProperty({}, newItem.id, handler$)));
    },
    remove: function remove(itemForRemoval) {
      var id = itemForRemoval && itemForRemoval.id;
      id && handler$Hash[id] && handler$Hash[id].removeListener(proxy);

      return collection(options, items.filter(function (item) {
        return item !== itemForRemoval;
      }), _extends({}, handler$Hash, _defineProperty({}, id, null)));
    },
    asArray: function asArray() {
      return items.slice(); // returns a copy of items to avoid mutation
    },


    reducers: reducers
  };
}

function Collection(component) {
  var sources = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
  var handlers = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  var reducers = _xstream2.default.create();
  var proxy = {
    next: function next(value) {
      reducers.shamefullySendNext(value);
    },
    error: function error(err) {
      reducers.shamefullySendError(err);
    },
    complete: function complete() {
      // Maybe autoremove here?
    }
  };

  return collection({ component: component, sources: sources, handlers: handlers, reducers: reducers, proxy: proxy });
}

Collection.pluck = function pluck(collection$, sinkProperty) {
  var sinks = {};

  function sink$(item) {
    var key = item.name + '.' + item.id + '.' + sinkProperty;

    if (sinks[key] === undefined) {
      if (sinkProperty === 'DOM') {
        sinks[key] = item[sinkProperty].map(function (vtree) {
          return _extends({}, vtree, { key: key });
        }).remember();
      } else {
        sinks[key] = item[sinkProperty].remember();
      }
    }

    return sinks[key];
  }

  return collection$.map(function (collection) {
    return collection.asArray().map(function (item) {
      return sink$(item);
    });
  }).map(function (sinkStreams) {
    return _xstream2.default.combine.apply(_xstream2.default, [function () {
      for (var _len = arguments.length, items = Array(_len), _key = 0; _key < _len; _key++) {
        items[_key] = arguments[_key];
      }

      return items;
    }].concat(_toConsumableArray(sinkStreams)));
  }).flatten().startWith([]);
};

// convert a stream of items' sources snapshots into a stream of collections
Collection.gather = function gather(itemsState$, component, sources, handlers) {
  var idAttribute = arguments.length <= 4 || arguments[4] === undefined ? 'id' : arguments[4];

  var makeDestroyable = function makeDestroyable(component) {
    return function (sources) {
      var sinks = component(sources);
      return _extends({}, sinks, {
        remove$: _xstream2.default.merge(sinks.remove$ || _xstream2.default.never(), sources.destroy$)
      });
    };
  };
  var collection = Collection(makeDestroyable(component), sources, _extends({
    remove$: function remove$(collection, item) {
      return collection.remove(item);
    }
  }, handlers));
  // each time a new item appears, it should be added to the collection
  var addReducers$ = itemsState$
  // get the added items at each step
  .fold(function (_ref, items) {
    var prevIds = _ref.prevIds;
    return {
      prevIds: items.map(function (item) {
        return item[idAttribute];
      }),
      addedItems: items.filter(function (item) {
        return prevIds.indexOf(item[idAttribute]) === -1;
      })
    };
  }, {
    prevIds: [],
    addedItems: []
  }).map(function (_ref2) {
    var addedItems = _ref2.addedItems;
    return addedItems;
  }).filter(function (addedItems) {
    return addedItems.length;
  })
  // turn each new item into a hash of source streams, tracking all the future updates
  .map(function (addedItems) {
    return addedItems.map(function (addedItem) {
      var itemStateInfinite$ = itemsState$.map(function (items) {
        return items.find(function (item) {
          return item[idAttribute] === addedItem[idAttribute];
        });
      });
      // if an item isn't present if a new snapshot, it shall be destroyed
      var destroy$ = itemStateInfinite$.filter(function (item) {
        return !item;
      }).take(1);
      var itemState$ = itemStateInfinite$.endWhen(destroy$);

      return Object.keys(addedItem).reduce(function (sources, key) {
        if (key === idAttribute) {
          return sources;
        }

        return _extends({}, sources, _defineProperty({}, key, itemState$.map(function (state) {
          return state[key];
        }).startWith(addedItem[key])
        // skip the snapshot if the value didn't change
        .compose((0, _dropRepeats2.default)(function (value, nextValue) {
          if (value === nextValue) {
            return true;
          }
          try {
            if (JSON.stringify(value) === JSON.stringify(nextValue)) {
              return true;
            }
          } catch (e) {}
          // if not equal or not serializable
          return false;
        })).remember()));
      }, {
        destroy$: destroy$
      });
    });
  }).map(function (itemsSources) {
    return function (collection) {
      return itemsSources.reduce(function (collection, sources) {
        return collection.add(sources);
      }, collection);
    };
  });
  return _xstream2.default.merge(addReducers$, collection.reducers).fold(function (collection, reducer) {
    return reducer(collection);
  }, collection);
};

exports.default = Collection;