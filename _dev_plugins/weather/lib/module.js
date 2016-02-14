'use strict';

var _           = require('lodash');
var Forecast    = require('forecast');
var moment      = require('moment');
var config      = require('../config.js');
var i18n        = require("i18n");

class Module{

    /**
     *
     */
    constructor(helper) {
        this.logger = helper.getLogger();
        this.helper = helper;
        this.forecast = new Forecast({
            service: 'forecast.io',
            key: config.forecastKey,
            units: 'celcius', // Only the first letter is parsed
            cache: true,      // Cache API requests?
            ttl: {            // How long to cache requests. Uses syntax from moment.js: http://momentjs.com/docs/#/durations/creating/
                minutes: 27,
                seconds: 45
            }
        });

        i18n.configure({
            locales:['fr', 'en'],
            directory: config.localesDir + '/locales',
            defaultLocale: 'fr',
            updateFiles: true
        });
    }

    initialize(cb){
        var self = this;

        this.helper.onNewTask(function(task){
            self._say(task);
        });

        return cb();
    }

    getConfig(){
        // set task options default values
        var tmp = config.module;
        var userOptions = this.helper.getUserOptions();
        tmp.taskOptions.forEach(function(option){
            if(userOptions[option.name]){
                option.default = userOptions[option.name];
            }
        });
        return tmp;
    }

    /**
     * Say the weather
     */
    _say(task){
        var self = this;
        var options = task.options;

        if(!this._checkOptions(options)){
            self.helper.notify('warn', 'Please configure the module before using it');
            return;
        }

        self._retrieveWeather(options.latitude, options.longitude, function(err, weather){
            if(err){
                self.helper.notify('error', err);
                return;
            }

            var temp = weather.currently.temperature.toString(); // ex 7.23
            var sentence = config.defaultSentence;
            if(options.sentence){
                sentence = options.sentence;
            }
            sentence = sentence
                .replace('[city]', options.city)
                .replace('[summary]', i18n.__(weather.currently.summary))
                .replace('[degree]', temp.split(".")[0]);

            self.helper.executeMessage(task, sentence);
        });
    }

    /**
     *
     * @param lat
     * @param lon
     * @param cb
     * @private
     */
    _retrieveWeather(lat, lon, cb){
        // Retrieve weather information from coordinates (Sydney, Australia)
        this.forecast.get([lat, lon], function(err, weather) {
            return cb(err, weather);
        });
    }

    _checkOptions(options){
        if(!options.latitude || !options.longitude || !options.city){
            this.logger.error('invalid options for the task', options);
            return false;
        }
        return true;
    }
}

module.exports = Module;
