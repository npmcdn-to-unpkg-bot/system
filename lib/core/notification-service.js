'use strict';

var chalk = require('chalk');

class Notification {

    constructor(adapter, type, message/*, userID*/){
        this.type = type;
        this.message = message;
        // this.userID = userID;
        //this.adapter = adapter;
    }

    toJSON(){
        return {
            type: this.type,
            message: this.message,
            // userID: this.userID,
        }
    }

    //save(){
    //    this.adapter.save(this.toJSON());
    //}
}

class NotificationService{

    constructor(system){
        this.logger = system.logger.Logger.getLogger('NotificationService');
        this.system = system;
        this.adapter = null;
    }

    /**
     * Notify the entire system.
     *
     * Use the daemon event bus to attach a notification.
     * Module are free to listen on this event.
     *
     * @param type
     * @param message
     */
    push(type, message){
        var notification = new Notification(this.adapter, type, message/*, this.system.getCurrentProfile().getId()*/);

        var color = function(text){ return text; };
        switch(type){
            case 'error':
                color = chalk.red.inverse;
                break;
        }
        this.logger.verbose('New notification of type [%s] -> %s', notification.type, color(notification.message));

        this.system.emit('notification:new', notification.toJSON());

        // Save notification
        this.system.apiService.createNotification(notification);
    }

    /**
     * @param {BaseAdapter} adapter
     */
    //setStorageAdapter(adapter){
    //    this.adapter = adapter;
    //}
}

module.exports = NotificationService;