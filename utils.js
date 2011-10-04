/*global module*/

(function () {

    "use strict";

    // Taked from https://github.com/fluid-project/infusion/blob/master/src/webapp/framework/core/js/Fluid.js

    var utils = {};
    
    utils.isArrayable = function (list) {
        return list && 
            typeof list === "object" && 
            typeof list.length === "number" && 
            !(list.propertyIsEnumerable("length")) && 
            typeof list.splice === 'function';
    };
    
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
    
    var mapImpl = function (list, togo, key, args) {
        var value = list[key];
        var i = 1;
        for (i; i < args.length; ++i) {
            value = args[i](value, key);
        }
        togo[key] = value;
    };
    
    utils.map = function (list) {
        if (!list) {
            return;
        }
        var isArrayable = utils.isArrayable(list);
        var togo = isArrayable ? [] : {};
        if (isArrayable) {
            var i;
            for (i = 0; i < list.length; ++i) {
                mapImpl(list, togo, i, arguments);
            }
        } else {
            var key;
            for (key in list) {
                mapImpl(list, togo, key, arguments);
            }
        }
        return togo;
    };
    
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