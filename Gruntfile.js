'use strict';

module.exports = function(grunt) {

  // configure grunt
  grunt.initConfig({

    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      files: [
        '**/*.js',
        '!node_modules/**/*',
        '!browser/dist/**/*',
        '!browser/test/**/*',
      ],
      options: {
        node: true
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

    browserify: {
      standalone: {
        src: [ '<%= pkg.name %>.js' ],
        dest: './browser/dist/<%= pkg.name %>.standalone.js',
        options: {
          standalone: '<%= pkg.name %>'
        }
      },
    },

    connect: {
      server: {},
    },
  });

  // Load plug-ins
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-connect');
  // grunt.loadNpmTasks('grunt-contrib-whatever');

  // define tasks
  grunt.registerTask('default', [
    'jshint',
    'browserify',
  ]);
};
