'use strict';

var EventEmitter        = require('events');
var async               = require('async');
var childProcess        = require('child_process');
var _                   = require('lodash');
var PluginsHandler      = require(CORE_DIR + '/plugins/plugins-handler.js');
var Speaker             = require(CORE_DIR + '/speaker').Speaker;
// var Task                = require(CORE_DIR + '/plugins/tasks').Task;
// var user                = require(CORE_DIR + '/users');
var ApiServer           = require(LIB_DIR + '/api-server');
var WebServer           = require(LIB_DIR + '/web-server');
var ConfigHandler       = require(CORE_DIR + '/config-handler');
var SpeechHandler       = require(CORE_DIR + '/speech/speech-handler.js');
var ModuleHandler       = require(CORE_DIR + '/plugins/modules').Handler;
var NotificationService = require(CORE_DIR + '/notification-service');
var taskQueue           = require('my-buddy-lib').taskQueue;
var repositories        = require(CORE_DIR + '/repositories');
var RuntimeHelper       = require(CORE_DIR + '/runtime-helper');
var utils               = require('my-buddy-lib').utils;
var path                = require('path');
var packageInfo         = require(ROOT_DIR + '/package.json');
var Logger              = require('my-buddy-lib').logger.Logger;
var Bus                 = require(CORE_DIR + '/bus');
var api                 = require(CORE_DIR + "/api");

/**
 * Daemon is the main program daemon.
 * This daemon stay alive as long as the program is not shut down.
 */
class Daemon extends EventEmitter {

    constructor(configOverride){
        super();

        this.logger = LOGGER.getLogger('Daemon');
        this.logger.Logger = LOGGER;
        this.logger.getLogger = LOGGER.getLogger.bind(LOGGER);

        this.logger.info('Starting...');

        global.MyBuddy = this;

        this.info = {
            startedAt: new Date(),
            version: packageInfo.version
        };
        // Used to handle running profile / tasks / etc
        this.runtimeHelper          = new RuntimeHelper(this);
        this.configHandler          = new ConfigHandler(this, configOverride);
        this.apiServer              = new ApiServer(this);
        this.webServer              = new WebServer(this);
        this.pluginsHandler         = new PluginsHandler(this);
        this.moduleHandler          = new ModuleHandler(this);
        this.notificationService    = new NotificationService(this);
        this.apiService             = new api.ApiService(this);
        this.speaker                = new Speaker(this);
        this.speechHandler          = new SpeechHandler();
        this.localRepository        = new repositories.LocalRepository(this);
        this.repository             = new repositories.Repository(this);
        // Contain plugins by their names
        this.plugins                = new Map();
        // Contain modules by their names
        this.modules                = new Map();
        // Contain tasks by their id
        this.tasks                  = new Map();
        this.bus                    = new Bus(this);
    }

    init(cb) {
        var self = this;

        // We should not do anything here
        // The system is in undefined state
        process.on('uncaughtException', function(err){
            self.logger.error('My buddy crashed because of uncaught error. The process will be terminated :(');
            self._onUnexpectedError(err);
        });

        process.on('unhandledRejection', function(err){
            self.logger.error('My buddy crashed because of uncaught promise error. The process will be terminated :(');
            self._onUnexpectedError(err);
        });

        // Intercept ctrl+c or console quit
        process.on('SIGINT', function() {
            self.shutdown();
        });

        // Intercept process.kill
        process.on('SIGTERM', function() {
            self.shutdown();
        });

        this.on('shutdown', function(){
            self.logger.info('The system is shutting down');
        });

        this.on('restarting', function(){
            self.logger.info('The system is restarting');
        });

        this._bootstrap(function(err){
            if(err){
                errorOnStartup(err);
                return;
            }

            // Splash final information
            self.logger.info('The system is now started and ready!');
            self.logger.info('The web interface is available at at %s or %s for remote access', self.webServer.getLocalAddress(), self.webServer.getRemoteAddress());
            self.logger.info('The API is available at at %s or %s for remote access', self.apiServer.getLocalAddress(), self.apiServer.getRemoteAddress());
            console.log('');

            // Play some system sounds
            self.playSystemSound('start_up.wav');
            self.runtimeHelper.profile.on('profile:start:complete', function(){
                self.playSystemSound('profile_loaded.wav');
            });

            self._attachProfileEventsTasks();

            // Try to start profile if one is defined on startup
            var profileToLoad = self.getConfig().profileToLoadOnStartup;
            if(profileToLoad) {
                self.runtimeHelper.profile.startProfile(profileToLoad)
                    .then(function(){
                        self.logger.info("Profile %s has been started", profileToLoad);

                        //var md = self.modules.get("keypress-trigger:keypress-trigger");
                        //md.newTrigger({}, function() {
                        //    console.log("coucou");
                        //});
                    })
                    .catch(errorOnStartup);
            }

            return cb();
        });

        function errorOnStartup(err) {
            self.logger.error("A critical error occurred during daemon startup. Process will be terminated.");
            self.logger.error(err);
            self.shutdown(1, null);
        }
    }

    /**
     * @param processCode null|0 by default
     * @param restart
     */
    shutdown(processCode, restart){
        if(!processCode){
            processCode = 0; // no problem
        }

        this.emit(restart ? 'restarting' : 'shutdown');

        // Process each task on shutdown
        this.logger.verbose('Process all registered shutdown task before shutdown');
        taskQueue.proceed('shutdown', { stopOnError: false }, function(){
            // ignore error
            process.exit(restart ? 42 : processCode);
        });
    }

    restart(){
        this.shutdown(0, true);
    }

    getInfo(){
        return _.merge(this.info, {
            uptime: process.uptime(),
            nodeVersions: process.versions
        });
    }

    getConfig(){
        return this.configHandler.getSystemConfig();
    }

    _onUnexpectedError(error){
        // kill speaker to avoid having phantom sounds if system crash
        this.speaker.kill();
        this.logger.error(error);
        process.exit(1);
    }

    _bootstrap(done){
        var self = this;
        // get user bootstrap if it exist
        var userBootstrap = function(a,b,c){return c()};
        try{
            userBootstrap = require(process.env.APP_ROOT_PATH + '/bootstrap.js');
        }
        catch(e){}

        async.series([
            function(cb){
                require('./bootstrap')(self, self.logger, cb);
            },
            function(cb){
                self.logger.debug('Run user bootstrap');
                userBootstrap(self, self.logger, cb);
            }
        ], function(err){
            // I do not know why but a bug with bluebird make promise in userBootstrap catch uncaughtException
            // that may occurs later in sequentially code which trigger the cb passed twice ... We also lost trace for real uncaughtException error
            setImmediate(function(){
                return done(err);
            });
        });
    }

    /**
     * Its better to handle both start and stop event here to have one place to manage run/clean up task.
     * @private
     */
    _attachProfileEventsTasks(){
        var self = this;

        // on new profile to start register some stuff
        taskQueue.register('profile:start', function(cb){

            var profileId = self.runtimeHelper.profile.getActiveProfile().id;
            var plugins = null;
            var tasks   = null;

            // get plugins
            self.apiService.findAllPluginsByUser(profileId)
                .then(function(data){
                    plugins = data;
                    return plugins;
                })
                // get tasks
                .then(function(){
                    return self.apiService.findAllTasksByUser(profileId)
                        .then(function(data){
                            tasks = data;
                            return tasks;
                        });
                })
                .then(function(){
                    async.series([

                        // Synchronize plugins
                        // download the plugins if not exist
                        function(done2){
                            self.logger.verbose('Synchronizing plugins..');
                            self.repository.synchronize(plugins)
                                .then(function(){
                                    return done2();
                                })
                                .catch(done2);
                        },

                        // load plugins into system
                        // The packages will be required and each
                        // plugin is able to register some modules.
                        function(done2){
                            self.logger.verbose('Load plugins...');
                            self.pluginsHandler
                                .loadPlugins(profileId, plugins)
                                .then(function(plugins){
                                    // first empty all runtime plugins
                                    self.plugins.clear();
                                    // Then attach all new created plugins
                                    // plugins is a list of system plugin object that contains some info and the instance of plugin.
                                    plugins.forEach(function(plugin){
                                        self.logger.debug("Plugin %s correctly loaded", plugin.name);
                                        self.plugins.set(plugin.getId(), plugin);
                                    });
                                    return done2();
                                })
                                .catch(done2);
                        },

                        // Now we need to initialize all modules that have been registered
                        function(done){
                            self.logger.debug('Initialize modules ...');
                            self.moduleHandler.initializeModules(done);
                        }
                    ], function(err){
                        if(err){
                            return Promise.reject(err);
                        }

                        // for now end process now
                        // and process task in another background
                        cb();

                        setImmediate(function(){
                            self.logger.debug('Process user stored tasks');

                            // pass all tasks presents in config + db
                            _.forEach(tasks, function(task){

                                // No need to save again, just register.
                                self.runtimeHelper.registerTask(task, function(err){
                                    if(err){
                                        self.logger.warn("An error occurred when registering the task " + task.id + " => " + err);
                                    }
                                });
                            });

                        });
                    });
                })
                .catch(cb);
        });

        // On current profile to stop
        taskQueue.register('profile:stop', function(cb){

            var activeProfile = self.runtimeHelper.profile.getActiveProfile().id;

            var tasksIds = Array.from(self.tasksMap.keys());

            // Clean up tasks
            async.map(tasksIds, function(id, cbTask){
                self.logger.debug('clean up task %s', id);
                self.runtimeHelper.unregisterTask(id);
                return cbTask();
            }, function(err){
                if(err) {
                    return cb(err);
                }
                async.parallel([
                    // clean up screen modules
                    function(cb2) {
                        self.logger.debug('Cleaning and destroying screens modules ...');
                        async.each(self.modules.values(), function(container, cb) {
                            self.webServer.destroyScreen(container, cb);
                        }, cb2);
                    },
                    // clean up modules
                    function(cb2) {
                        var promises = [];
                        for (let module of self.modules) {
                            self.logger.verbose("Destroying module %s", module.name);
                            promises.push(module.destroy());
                        }
                        Promise.all(promises)
                            .then(function() {
                                self.logger.verbose("All modules has been destroyed");
                                self.modules.clear();
                                cb2();
                            })
                            .catch(function() { cb2(); });
                    },
                    // clean up plugins
                    function(cb2) {
                        self.plugins.clear();
                        return cb2();
                    }
                ], cb);
            });
        });
    }

    /**
     * @check C:\Windows\Media\Garden
     * @param file
     */
    playSystemSound(file){
        if(this.configHandler.getConfig().playSystemSounds){
            return this.speaker.playFile(this.configHandler.getConfig().resourcesDir + '/system/' + file);
        }
    }
}

/**
 *
 * @param userConfig
 * @param cb
 */
Daemon.start = function(userConfig, cb){
    cb = cb || function(){};
    userConfig = userConfig || {};

    if(typeof userConfig === 'function'){
        cb = userConfig;
        userConfig = {};
    }

    // Build system config
    var config = _.merge(utils.loadConfig(ROOT_DIR + '/config'), userConfig);

    // Set some config now (only possible during runtime or when forced)
    config.system.pluginsTmpDir = config.system.pluginsTmpDir || path.resolve(config.system.tmpDir, 'plugins');

    // Build system logger
    global.LOGGER = new Logger(config.log);
    var logger = LOGGER.getLogger('Daemon');

    logger.info('Start daemon');

    checkRequiredModules(function(err, missingModules){
        if(err) throw err;
        if(missingModules.length > 0){
            logger.error('It seems that some required global modules are not installed. Please verify these modules: ' + missingModules.join(', ') );
            process.exit(0);
        }

        // init required folders
        utils.initDirsSync([
            config.system.tmpDir,
            config.system.dataDir,
            // config.system.persistenceDir,
            config.system.pluginsTmpDir,
            path.resolve(config.system.dataDir, 'plugins')
        ]);

        var daemon = new Daemon(config);
        daemon.init(function(err){
            return cb(err, daemon);
        });
    });

    /**
     * Check for required global modules.
     * @param cb
     */
    function checkRequiredModules(cb){
        var missingModules = [];

        async.parallel([
            function(done){
                childProcess.exec('gulp -v', function(err){
                    if(err){
                        missingModules.push('gulp');
                    }
                    return done();
                });
            },
        ], function(err){
            return cb(null, missingModules);
        });
    }
};

module.exports = Daemon;
