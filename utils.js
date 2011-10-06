/*global module*/

(function () {

    "use strict";

    // Taked from https://github.com/fluid-project/infusion/blob/master/src/webapp/framework/core/js/Fluid.js

    var utils = {};
    
    // Verify if the object is arrayable.
    utils.isArrayable = function (list) {
        return list && 
            typeof list === "object" && 
            typeof list.length === "number" && 
            !(list.propertyIsEnumerable("length")) && 
            typeof list.splice === 'function';
    };
    
    // Iterate over the object/array and apply callback to every its every element.
    utils.each = function (list, callback) {
        if (!list) {
            return;
        }
        if (!callback || typeof callback !== "function") {
            return;
        }
        if (utils.isArrayable(list)) {
            var i;
            for (i = 0; i < list.length; ++i) {
                callback(list[i], i);
            }
        } else {
            var key;
            for (key in list) {
                callback(list[key], key);
            }
        }       
    };
    
    var transformImpl = function (list, togo, key, args) {
        var value = list[key];
        var i = 1;
        for (i; i < args.length; ++i) {
            value = args[i](value, key);
        }
        togo[key] = value;
    };
    
    // Map transformation from array/object to an array based on the callback criteria.
    utils.transform = function (list) {
        if (!list) {
            return;
        }
        var isArrayable = utils.isArrayable(list);
        var togo = isArrayable ? [] : {};
        if (isArrayable) {
            var i;
            for (i = 0; i < list.length; ++i) {
                transformImpl(list, togo, i, arguments);
            }
        } else {
            var key;
            for (key in list) {
                transformImpl(list, togo, key, arguments);
            }
        }
        return togo;
    };
    
    utils.map = function (list) {
        var list = utils.transform.apply(null, arguments);
        return utils.remove_if(list, function (val) {
            return typeof val === "undefined";
        });
    };
    
    utils.remove_if = function (source, fn) {
        if (utils.isArrayable(source)) {
            for (var i = 0; i < source.length; ++i) {
                if (fn(source[i], i)) {
                    source.splice(i, 1);
                    --i;
                }
            }
        } else {
            for (var key in source) {
                if (fn(source[key], key)) {
                    delete source[key];
                }
            }
        }
        return source;
    };
    
    // Find an element in the array/list based on the callback criteria.
    utils.find = function (list, callback, deflt) {
        var disp;
        if (utils.isArrayable(list)) {
            var i;
            for (i = 0; i < list.length; ++i) {
                disp = callback(list[i], i);
                if (disp !== undefined) {
                    return disp;
                }
            }
        } else {
            var key;
            for (key in list) {
                disp = callback(list[key], key);
                if (disp !== undefined) {
                    return disp;
                }
            }
        }
        return deflt;
    };
    
    module.exports = utils;
    
})();