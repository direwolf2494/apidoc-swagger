var _           = require('lodash');
var apidoc      = require('apidoc-core');
var winston     = require('winston');
var format      = require('winston').format;
var path        = require('path');
var markdown    = require('marked');
var fs          = require('fs-extra');
var PackageInfo = require('./package_info');

var apidocSwagger = require('./apidocToSwagger');

var defaults = {
    dest    : path.join(__dirname, '../doc/'),
    template: path.join(__dirname, '../template/'),
    
    debug           : false,
    silent          : false,
    verbose         : false,
    simulate        : false,
    parse           : false, // only parse and return the data, no file creation
    colorize        : true,
    markdown        : false,
    defaultResponse : false,
    marked: {
        gfm         : false,
        tables      : false,
        breaks      : false,
        pedantic    : false,
        sanitize    : false,
        smartLists  : false,
        smartypants : false
    }
};

var app = {
    log     : {},
    markdown: false,
    options : {}
};

// uncaughtException
process.on('uncaughtException', function(err) {
    console.error((new Date()).toUTCString() + ' uncaughtException:', err.message);
    console.error(err.stack);
    process.exit(1);
});

function createApidocSwagger(options) {
    var api;
    var apidocPath = path.join(__dirname, '../');
    var packageInfo;

    options = _.defaults({}, options, defaults);

    // paths
    options.dest     = path.join(options.dest, './');

    // options
    app.options = options;

    // logger
    app.log = winston.createLogger({
        format: format.combine(
            format.splat(),
            format.simple()
        ),
        transports: [
            new winston.transports.Console({
                level      : app.options.debug ? 'debug' : app.options.verbose ? 'verbose' : 'info',
                silent     : app.options.silent,
                prettyPrint: true,
                colorize   : app.options.colorize,
                timestamp  : false,
            })
        ]
    })

    // markdown
    if(app.options.markdown === true) {
        app.markdown = markdown;
        app.markdown.setOptions(app.options.marked);
    }

    try {
        packageInfo = new PackageInfo(app);
        // generator information
        var json = JSON.parse( fs.readFileSync(apidocPath + 'package.json', 'utf8') );
        apidoc.setGeneratorInfos({
            name   : json.name,
            time   : new Date(),
            url    : json.homepage,
            version: json.version
        });
        // configure apidoc parser
        apidoc.setLogger(app.log);
        apidoc.setMarkdownParser(app.markdown);
        apidoc.setPackageInfos(packageInfo.get());
        // parse the docstrings
        api = apidoc.parse(app.options);
        
        if (api === true) {
            app.log.info('Nothing to do.');
            return true;
        }
        if (api === false)
            return false;

        if (!app.options.parse){
            // parse apidocs spec and apidocs.json
            var apidocData = JSON.parse(api.data);
            var projectData = JSON.parse(api.project);
            // set values for swagger spec attributes
            var swaggerOptions = {
                host            : app.options.host ? app.options.host : (projectData.url) ? projectData.url : "localhost",
                defaultResponse : app.options.defaultResponse,
                schemes         :  app.options.schemes,
                basePath        :  app.options.basePath
            }
            // convert apidocs spec to swagger and save to file
            api["swaggerData"] = JSON.stringify(apidocSwagger.toSwagger(apidocData , projectData, swaggerOptions), null, 2); 
            createOutputFile(api);
        }

        app.log.info('Done.');
        return api;
    } catch(e) {
        app.log.error(e.message);
        if (e.stack)
            app.log.debug(e.stack);
        return false;
    }
}

function createOutputFile(api){
    if (app.options.simulate)
        app.log.warn('!!! Simulation !!! No file or dir will be copied or created.');

    app.log.verbose('create dir: ' + app.options.dest);
    if ( ! app.options.simulate)
        fs.mkdirsSync(app.options.dest);

    //Write swagger
    app.log.verbose('write swagger json file: ' + app.options.dest + 'swagger.json');
    if( ! app.options.simulate)
        fs.writeFileSync(app.options.dest + './swagger.json', api.swaggerData); 
}

module.exports = {
    createApidocSwagger: createApidocSwagger
};