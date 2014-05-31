'use strict';

module.exports = function(grunt) {

  // configure grunt
  grunt.initConfig({

    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      files: [
        '**/*.js',
        '!node_modules/**/*',
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    // run the mocha tests via Node.js
    mochaTest: {
      test: {
        options: {
          reporter: 'spec'
        },
        src: ['test/**/*.js']
      }
    },
  });

  // Load plug-ins
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-mocha-test');
  // grunt.loadNpmTasks('grunt-contrib-whatever');

  // define tasks
  grunt.registerTask('default', [
    'jshint',
  ]);

  // define tasks
  grunt.registerTask('default', [
    // No tasks, yet
  ]);
};
