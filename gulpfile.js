'use strict';

var gulp = require('gulp');
var install = require("gulp-install");

gulp.task('install_dev_plugins', function(){
    gulp.src(['./_dev_plugins/*/package.json'])
        .pipe(install());
});