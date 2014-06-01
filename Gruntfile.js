'use strict';

module.exports = function(grunt) {

  // configure grunt
  grunt.initConfig({

    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      files: [
        '**/*.js',
        '!node_modules/**/*',
        '!lib/<%= pkg.name %>.standalone.js',
        '!lib/ext/**',
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

    watchify: {
      standalone: {
        src: './lib/<%= pkg.name %>/Client.js',
        dest: './lib/<%= pkg.name %>.standalone.js',
        options: {
          standalone: '<%= pkg.name %>'
        }
      }
    },

    watch: {
      app: {
        files: './lib/<%= pkg.name %>.standalone.js',
        options: {
          livereload: true
        }
      }
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
  grunt.loadNpmTasks('grunt-watchify');

  // Load custom tasks
  grunt.loadTasks('tasks');

  // define tasks
  grunt.registerTask('default', [
    'jshint',
    // 'watchify',
    'server',
  ]);
};
