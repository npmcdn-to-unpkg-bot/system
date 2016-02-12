/**
 * This is the user config.
 *
 */
module.exports = {

    /**
     * Define your sleep time
     * Sleep time is a period when you can avoid some actions
     * like play sounds on speakers
     */
    sleepTime: ["07:00", "08:00"],

    // Override default user module path
    // By default, the module loader will lookup by module name
    externalModuleRepositories: [],

    tmpDir: '.tmp',

    log: {
        level: 'debug'
    },

    //coreModulesPath: '/lib/core_modules',

    // User modules to activate
    // Handled by app
    activeModules: [],

    // The list of actions a task can do.
    // This list will be filled dynamically with core module
    // For example a core module can add the action [mail].
    // Then a task can be created with action [mail]. The core module
    // will listen for [mail] event and do things ...
    taskActions: {

    },

    tasks: [],

    // Persistance relative
    persistancePath: '/data/storage',
    databasePath: 'persistence.db',
    taskDatabase: 'tasks.db',
    //messagesAdaptersDb: 'messagesAdapters.db',
    notificationsDb: 'notifications.db'
};