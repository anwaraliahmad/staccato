var gulp = require('gulp')
var uglify = require('gulp-uglify')
var babelify = require('babelify')
var browserify = require('browserify')
var streamify = require('gulp-streamify')
var bs = require('browser-sync').create()
var source = require('vinyl-source-stream');

// Compile the JavaScript 
gulp.task('js', function() {
		return browserify({entries: './src/main.js', extensions: ['.js'], debug: true})
        .transform(babelify)
        .bundle()
        .pipe(source('bundle.js'))
        .pipe(streamify(uglify()))
        .pipe(gulp.dest('dist'))
})


// Start the server 
gulp.task('server', ['js'], function() {
		bs.init({server: './dist'})
		bs.watch(__dirname + '/src/*.js', ['js']);
})