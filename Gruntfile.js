'use strict';

module.exports = function(grunt) {

  // configure grunt
  grunt.initConfig({

    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      files: [
        '**/*.js',
        '!node_modules/**/*',
        '!bower_components/**/*',
        '!lib/<%= pkg.name %>.standalone.js',
        '!lib/ext/**',
        '!browser/test/**/*',
        '!test/js/qunit-1.14.0.js',
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
      server: {
        options: {
          port: 1234,
          base: '.'
        }
      }
    },

    qunit: {
      online: {
        options: {
          urls: [
            'http://localhost:1234/test/runner-grunt.html',
          ],
        },
      },
      offline: {
        options: {
          urls: [
            'test/runner-grunt.html',
          ],
        },
      },
      options: {
        screenshot: true,
        inject: undefined,
        // inject: 'test/js/qunit-phantomjs-bridge.js',
        // don't inject, use a custom runner to get a RequireJS script tag
      },
    },

    buster: {
      server: {}
    }
  });

  // Load plug-ins
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-buster');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-qunit');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-watchify');

  // Load custom tasks
  grunt.loadTasks('tasks');

  // define tasks
  grunt.registerTask('default', [
    'jshint',
    // 'watchify',
    'server',
  ]);

  grunt.registerTask('test:online', ['connect', 'qunit:online',]);
  grunt.registerTask('test:offline', ['qunit:offline',]);
  grunt.registerTask('test', ['buster', 'test:offline',]);
};
