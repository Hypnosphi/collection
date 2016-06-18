'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _xstream = require('xstream');

var _xstream2 = _interopRequireDefault(_xstream);

var _delay = require('xstream/extra/delay');

var _delay2 = _interopRequireDefault(_delay);

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

function makeItem(component, sources) {
  var newId = id();

  var newItem = (0, _isolate2.default)(component, newId.toString())(sources);

  newItem._id = newId;
  newItem._name = component.name;

  return newItem;
}

function collection(options) {
  var items = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];
  var component = options.component;
  var sources = options.sources;
  var removeSinkName = options.removeSinkName;


  return {
    add: function add() {
      var additionalSources = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var newItem = makeItem(component, _extends({}, sources, additionalSources));
      var removeSink = newItem[removeSinkName] || _xstream2.default.empty();
      newItem._remove$ = removeSink.take(1).mapTo(newItem);

      return collection(options, [].concat(_toConsumableArray(items), [newItem]));
    },
    remove: function remove(itemForRemoval) {
      return collection(options, items.filter(function (item) {
        return item !== itemForRemoval;
      }));
    },
    asArray: function asArray() {
      return items.slice(); // returns a copy of items to avoid mutation
    }
  };
}

function Collection(component) {
  var sources = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
  var add$ = arguments.length <= 2 || arguments[2] === undefined ? _xstream2.default.empty() : arguments[2];
  var removeSinkName = arguments.length <= 3 || arguments[3] === undefined ? 'remove$' : arguments[3];

  var removeProxy$ = _xstream2.default.create();
  var addReducer$ = add$.map(function (sourcesList) {
    return function (collection) {
      if (Array.isArray(sourcesList)) {
        // multiple items
        return sourcesList.reduce(function (collection, sources) {
          return collection.add(sources);
        }, collection);
      } else {
        // single item
        return collection.add(sourcesList);
      }
    };
  });
  var removeReducer$ = removeProxy$.map(function (item) {
    return function (collection) {
      return collection.remove(item);
    };
  });
  var reducer$ = _xstream2.default.merge(addReducer$, removeReducer$);

  var emptyCollection = collection({ component: component, sources: sources, removeSinkName: removeSinkName });
  var collection$ = reducer$.fold(function (collection, reducer) {
    return reducer(collection);
  }, emptyCollection).map(function (collection) {
    return collection.asArray();
  });

  var remove$ = Collection.merge(collection$, '_remove$');
  removeProxy$.imitate(remove$);

  return collection$;
}

Collection.pluck = function pluck(collection$, sinkProperty) {
  var sinks = {};

  function sink$(item) {
    var key = item._name + '.' + item._id + '.' + sinkProperty;

    if (sinks[key] === undefined) {
      var sink = sinkProperty === 'DOM' ? item[sinkProperty].map(function (vtree) {
        return _extends({}, vtree, { key: key });
      }) : item[sinkProperty];
      sinks[key] = sink.remember();
    }

    return sinks[key];
  }

  return collection$.map(function (items) {
    return items.map(function (item) {
      return sink$(item);
    });
  }).map(function (sinkStreams) {
    return _xstream2.default.combine.apply(_xstream2.default, _toConsumableArray(sinkStreams));
  }).flatten().startWith([]);
};

Collection.merge = function merge(collection$, sinkProperty) {
  var sinks = {};

  function sink$(item) {
    var key = item._name + '.' + item._id + '.' + sinkProperty;

    if (sinks[key] === undefined) {
      var sink = sinkProperty === 'DOM' ? item[sinkProperty].map(function (vtree) {
        return _extends({}, vtree, { key: key });
      }) : item[sinkProperty];
      // prevent sink from early completion and reinitialization
      sinks[key] = _xstream2.default.merge(sink, _xstream2.default.never());
    }

    return sinks[key];
  }

  return collection$.map(function (items) {
    return items.map(function (item) {
      return sink$(item);
    });
  }).map(function (sinkStreams) {
    return _xstream2.default.merge.apply(_xstream2.default, _toConsumableArray(sinkStreams));
  }).flatten();
};

// convert a stream of items' sources snapshots into a stream of collections
Collection.gather = function gather(component, sources, items$) {
  var removeSinkName = arguments.length <= 3 || arguments[3] === undefined ? 'remove$' : arguments[3];
  var idAttribute = arguments.length <= 4 || arguments[4] === undefined ? 'id' : arguments[4];

  function makeDestroyable(component) {
    return function (sources) {
      var sinks = component(sources);
      return _extends({}, sinks, _defineProperty({}, removeSinkName, _xstream2.default.merge(sinks[removeSinkName] || _xstream2.default.empty(), sources._destroy$)));
    };
  }

  // finds items not present in previous snapshot
  function findNewItems(_ref, items) {
    var prevIds = _ref.prevIds;

    return {
      prevIds: items.map(function (item) {
        return item[idAttribute];
      }),
      addedItems: items.filter(function (item) {
        return prevIds.indexOf(item[idAttribute]) === -1;
      })
    };
  }

  function compareJSON(value, nextValue) {
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
  }

  // turn a new item into a hash of source streams, tracking all the future updates
  function itemToSourceStreams(addedItem, itemsState$) {
    var itemStateInfinite$ = itemsState$.map(function (items) {
      return items.find(function (item) {
        return item[idAttribute] === addedItem[idAttribute];
      });
    });
    // if an item isn't present if a new snapshot, it shall be destroyed
    var _destroy$ = itemStateInfinite$.filter(function (item) {
      return !item;
    }).take(1);
    var itemState$ = itemStateInfinite$.endWhen(_destroy$.compose((0, _delay2.default)()));

    return Object.keys(addedItem).reduce(function (sources, key) {
      // skip idAttribute
      if (key === idAttribute) {
        return sources;
      }

      return _extends({}, sources, _defineProperty({}, key, itemState$.map(function (state) {
        return state[key];
      }).startWith(addedItem[key])
      // skip the snapshot if the value didn't change
      .compose((0, _dropRepeats2.default)(compareJSON)).remember()));
    }, {
      _destroy$: _destroy$
    });
  }

  var itemsState$ = items$.remember();

  var add$ = itemsState$
  // get the added items at each step
  .fold(findNewItems, { prevIds: [], addedItems: [] }).map(function (_ref2) {
    var addedItems = _ref2.addedItems;
    return addedItems;
  }).filter(function (addedItems) {
    return addedItems.length;
  }).map(function (addedItems) {
    return addedItems.map(function (item) {
      return itemToSourceStreams(item, itemsState$);
    });
  });

  return Collection(makeDestroyable(component), sources, add$, removeSinkName);
};

exports.default = Collection;