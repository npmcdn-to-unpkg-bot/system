(function() {
    'use strict';

    angular.module('components.tasks', [])

    .config(function($stateProvider) {

        $stateProvider

            // route for the about page
            .state('dashboard.tasks', {
                url: '/tasks',
                abstract: true,
                template : '<ui-view></ui-view>',
                controller  : 'TasksController'
            })

            .state('dashboard.tasks.list', {
                url: '/list',
                templateUrl : '/app/components/tasks/list.html',
                controller: 'TasksListController'
            })

            .state('dashboard.tasks.create', {
                url: '/create',
                templateUrl: '/app/components/tasks/new-task.html',
                controller: 'components.tasks.CreateController'
            })

            .state('dashboard.tasks.createForm', {
                url: '/create/:plugin/:module',
                templateUrl: '/app/components/tasks/forms/steps.html',
                controller: 'components.tasks.CreateFormController'
            })
    });
})();