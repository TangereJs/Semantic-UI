/*******************************
          Create Repos
*******************************/

/*
 This will create individual component repositories for each SUI component

  * copy component files from release
  * create commonjs files as index.js for NPM release
  * create release notes that filter only items related to component
  * custom package.json file from template
  * create bower.json from template
  * create README from template
  * create meteor.js file
*/

var
  // admin dependencies
  concatFileNames = require('gulp-concat-filenames'),
  git             = require('gulp-git'),
  githubAPI       = require('github'),
  runSequence     = require('run-sequence'),
  tap             = require('gulp-tap'),

  // admin files
  release         = require('./tasks/admin/release'),

  // stores oauth info for GitHub API
  oAuth           = fs.existsSync('./tasks/admin/oauth.js')
    ? require('./tasks/admin/oauth')
    : false,
  github

;

module.exports = function(callback) {
  var
    stream,
    index,
    tasks = []
  ;

  for(index in release.components) {

    var
      component = release.components[index]
    ;

    // streams... designed to save time and make coding fun...
    (function(component) {

      var
        outputDirectory      = release.outputRoot + component,
        isJavascript         = fs.existsSync(output.compressed + component + '.js'),
        isCSS                = fs.existsSync(output.compressed + component + '.css'),
        capitalizedComponent = component.charAt(0).toUpperCase() + component.slice(1),
        packageName          = release.packageRoot + component,
        repoName             = release.repoRoot + capitalizedComponent,
        gitURL               = 'https://github.com/' + release.org + '/' + repoName + '.git',
        repoURL              = 'https://github.com/' + release.org + '/' + repoName + '/',
        regExp               = {
          match            : {
            // templated values
            name      : '{component}',
            titleName : '{Component}',
            version   : '{version}',
            files     : '{files}',
            // release notes
            spacedVersions    : /(###.*\n)\n+(?=###)/gm,
            spacedLists       : /(^- .*\n)\n+(?=^-)/gm,
            trim              : /^\s+|\s+$/g,
            unrelatedNotes    : new RegExp('^((?!(^.*(' + component + ').*$|###.*)).)*$', 'gmi'),
            whitespace        : /\n\s*\n\s*\n/gm,
            // npm
            export            : /\$\.fn\.\w+\s*=\s*function\(parameters\)\s*{/g,
            formExport        : /\$\.fn\.\w+\s*=\s*function\(fields, parameters\)\s*{/g,
            settingsExport    : /\$\.fn\.\w+\.settings\s*=/g,
            settingsReference : /\$\.fn\.\w+\.settings/g,
            jQuery            : /jQuery/g,
          },
          replace : {
            // readme
            name              : component,
            titleName         : capitalizedComponent,
            // release notes
            spacedVersions    : '',
            spacedLists       : '$1',
            trim              : '',
            unrelatedNotes    : '',
            whitespace        : '\n\n',
            // npm
            export            :  'module.exports = function(parameters) {\n  var _module = module;\n',
            formExport        :  'module.exports = function(fields, parameters) {\n  var _module = module;\n',
            settingsExport    :  'module.exports.settings =',
            settingsReference :  '_module.exports.settings',
            jQuery            :  'require("jquery")'
          }
        },
        task = {
          all      : component + ' creating',
          repo     : component + ' create repo',
          bower    : component + ' create bower.json',
          readme   : component + ' create README',
          npm      : component + ' create NPM Module',
          notes    : component + ' create release notes',
          composer : component + ' create composer.json',
          package  : component + ' create package.json',
          meteor   : component + ' create package.js',
        }
      ;

      // copy dist files into output folder adjusting asset paths
      gulp.task(task.repo, false, function() {
        return gulp.src(release.source + component + '.*')
          .pipe(plumber())
          .pipe(flatten())
          .pipe(replace(release.paths.source, release.paths.output))
          .pipe(gulp.dest(outputDirectory))
        ;
      });

      // create npm module
      gulp.task(task.npm, false, function() {
        return gulp.src(release.source + component + '!(*.min|*.map).js')
          .pipe(plumber())
          .pipe(flatten())
          .pipe(replace(regExp.match.export, regExp.replace.export))
          .pipe(replace(regExp.match.formExport, regExp.replace.formExport))
          .pipe(replace(regExp.match.settingsExport, regExp.replace.settingsExport))
          .pipe(replace(regExp.match.settingsReference, regExp.replace.settingsReference))
          .pipe(replace(regExp.match.jQuery, regExp.replace.jQuery))
          .pipe(rename('index.js'))
          .pipe(gulp.dest(outputDirectory))
        ;
      });

      // create readme
      gulp.task(task.readme, false, function() {
        return gulp.src(release.templates.readme)
          .pipe(plumber())
          .pipe(flatten())
          .pipe(replace(regExp.match.name, regExp.replace.name))
          .pipe(replace(regExp.match.titleName, regExp.replace.titleName))
          .pipe(gulp.dest(outputDirectory))
        ;
      });

      // extend bower.json
      gulp.task(task.bower, false, function() {
        return gulp.src(release.templates.bower)
          .pipe(plumber())
          .pipe(flatten())
          .pipe(jeditor(function(bower) {
            bower.name = packageName;
            bower.description = capitalizedComponent + ' - Semantic UI';
            if(isJavascript) {
              if(isCSS) {
                bower.main = [
                  component + '.js',
                  component + '.css'
                ];
              }
              else {
                bower.main = [
                  component + '.js'
                ];
              }
              bower.dependencies = {
                jquery: '>=1.8'
              };
            }
            else {
              bower.main = [
                component + '.css'
              ];
            }
            return bower;
          }))
          .pipe(gulp.dest(outputDirectory))
        ;
      });

      // extend package.json
      gulp.task(task.package, false, function() {
        return gulp.src(release.templates.package)
          .pipe(plumber())
          .pipe(flatten())
          .pipe(jeditor(function(package) {
            if(isJavascript) {
              package.dependencies = {
                jquery: 'x.x.x'
              };
              package.main = 'index.js';
            }
            package.name = packageName;
            if(version) {
              package.version = version;
            }
            package.title       = 'Semantic UI - ' + capitalizedComponent;
            package.description = 'Single component release of ' + component;
            package.repository  = {
              type : 'git',
              url  : gitURL
            };
            return package;
          }))
          .pipe(gulp.dest(outputDirectory))
        ;
      });

      // extend composer.json
      gulp.task(task.composer, false, function() {
        return gulp.src(release.templates.composer)
          .pipe(plumber())
          .pipe(flatten())
          .pipe(jeditor(function(composer) {
            if(isJavascript) {
              composer.dependencies = {
                jquery: 'x.x.x'
              };
              composer.main = component + '.js';
            }
            composer.name        = 'semantic/' + component;
            if(version) {
              composer.version     = version;
            }
            composer.description = 'Single component release of ' + component;
            return composer;
          }))
          .pipe(gulp.dest(outputDirectory))
        ;
      });

      // create release notes
      gulp.task(task.notes, false, function() {
        return gulp.src(release.templates.notes)
          .pipe(plumber())
          .pipe(flatten())
          // Remove release notes for lines not mentioning component
          .pipe(replace(regExp.match.unrelatedNotes, regExp.replace.unrelatedNotes))
          .pipe(replace(regExp.match.whitespace, regExp.replace.whitespace))
          .pipe(replace(regExp.match.spacedVersions, regExp.replace.spacedVersions))
          .pipe(replace(regExp.match.spacedLists, regExp.replace.spacedLists))
          .pipe(replace(regExp.match.trim, regExp.replace.trim))
          .pipe(gulp.dest(outputDirectory))
        ;
      });

      // Creates meteor package.js
      gulp.task(task.meteor, function() {
        var
          fileNames = ''
        ;
        if(isJavascript) {
          fileNames += '    \'' + component + '.js\',\n';
        }
        if(isCSS) {
          fileNames += '    \'' + component + '.css\',\n';
        }
        return gulp.src(outputDirectory + '/assets/**/' + component + '?(s).*', { base: outputDirectory})
          .pipe(concatFileNames('dummy.txt', {
            newline : '',
            root    : outputDirectory,
            prepend : '    \'',
            append  : '\','
          }))
          .pipe(tap(function(file) { fileNames += file.contents; }))
          .on('end', function(){
            gulp.src(release.templates.meteorComponent)
              .pipe(plumber())
              .pipe(flatten())
              .pipe(replace(regExp.match.name, regExp.replace.name))
              .pipe(replace(regExp.match.titleName, regExp.replace.titleName))
              .pipe(replace(regExp.match.version, version))
              .pipe(replace(regExp.match.files, fileNames))
              .pipe(rename(release.files.npm))
              .pipe(gulp.dest(outputDirectory))
            ;
          })
        ;
      });


      // synchronous tasks in orchestrator? I think not
      gulp.task(task.all, false, function(callback) {
        runSequence([
          task.repo,
          task.npm,
          task.bower,
          task.readme,
          task.package,
          task.composer,
          task.notes,
          task.meteor
        ], callback);
      });

      tasks.push(task.all);

    })(component);
  }

  runSequence(tasks, callback);
});