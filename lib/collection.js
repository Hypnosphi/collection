'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _xstream = require('xstream');

var _xstream2 = _interopRequireDefault(_xstream);

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

  return function _Collection() {
    var items = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];
    var handler$Hash = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    return {
      add: function add() {
        var additionalSources = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

        var newItem = makeItem(component, _extends({}, sources, additionalSources));
        var handler$ = handlerStreams(component, newItem, handlers);
        handler$.addListener(proxy);

        return _Collection([].concat(_toConsumableArray(items), [newItem]), _extends({}, handler$Hash, _defineProperty({}, newItem.id, handler$)));
      },
      remove: function remove(itemForRemoval) {
        var id = itemForRemoval && itemForRemoval.id;
        id && handler$Hash[id] && handler$Hash[id].removeListener(proxy);
        return _Collection(items.filter(function (item) {
          return item !== itemForRemoval;
        }), _extends({}, handler$Hash, _defineProperty({}, id, null)));
      },
      asArray: function asArray() {
        return items.slice(); // returns a copy of items to avoid mutation
      },


      reducers: reducers
    };
  }();
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

exports.default = Collection;