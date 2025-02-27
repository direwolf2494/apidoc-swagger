#!/usr/bin/env node

'use strict';

/*
 * apidoc-swagger
 *
 * Copyright (c) 2015 Exact
 * Author Bahman Fakhr Sabahi <bahman.sabahi@exact.com>
 * Licensed under the MIT license.
 */

var path   = require('path');
var nomnom = require('nomnom');
var apidocSwagger = require('../lib/index');

var argv = nomnom
    .option('file-filters', { abbr: 'f', 'default': '.*\\.(clj|coffee|cs|dart|erl|go|java|scala|js|php?|py|rb|ts|pm)$',
            help: 'RegEx-Filter to select files that should be parsed (multiple -f can be used).' })

    .option('exclude-filters', { abbr: 'e', 'default': '',
            help: 'RegEx-Filter to select files / dirs that should not be parsed (many -e can be used).', })

    .option('input', { abbr: 'i', 'default': './', help: 'Input / source dirname.' })

    .option('output', { abbr: 'o', 'default': './doc/', help: 'Output dirname.' })    

    .option('verbose', { abbr: 'v', flag: true, 'default': false, help: 'Verbose debug output.' })

    .option('help', { abbr: 'h', flag: true, help: 'Show this help information.' })

    .option('debug', { flag: true, 'default': false, help: 'Show debug messages.' })

    .option('color', { flag: true, 'default': true, help: 'Turn off log color.' })

    .option('host', { help: 'target host to use instead of url in package.json/apidoc.json'})

    .option('default-response', { flag: true, default: false,
        help: 'uses default success responses instead of api doc generated responses'})

    .option('base-path', {default: '/', help: 'basepath for the api'})

    .option('schemes', {help: 'comma separated list of url schemes. defaults to http'})

    .option('parse', { flag: true, 'default': false,
            help: 'Parse only the files and return the data, no file creation.' })

    .option('parse-filters'  , { help: 'Optional user defined filters. Format name=filename' })
    .option('parse-languages', { help: 'Optional user defined languages. Format name=filename' })
    .option('parse-parsers'  , { help: 'Optional user defined parsers. Format name=filename' })
    .option('parse-workers'  , { help: 'Optional user defined workers. Format name=filename' })

    .option('silent', { flag: true, 'default': false, help: 'Turn all output off.' })

    .option('simulate', { flag: true, 'default': false, help: 'Execute but not write any file.' })

    // markdown settings
    .option('markdown', { flag: true, 'default': false, help: 'Turn on markdown parser.' })

    .option('marked-config',      { 'default': '',
            help: 'Enable custom markdown parser configs. It will overwite all other marked settings.' })

    .option('marked-gfm',         { flag: true, 'default': false,
            help: 'Enable GitHub flavored markdown.' })

    .option('marked-tables',      { flag: true, 'default': false,
            help: 'Enable GFM tables. This option requires the gfm option to be true.' })

    .option('marked-breaks',      { flag: true, 'default': false,
            help: 'Enable GFM line breaks. This option requires the gfm option to be true.' })

    .option('marked-pedantic',    { flag: true, 'default': false,
            help: 'Conform to obscure parts of markdown.pl as much as possible.' })

    .option('marked-sanitize',    { flag: true, 'default': false,
            help: 'Sanitize the output. Ignore any HTML that has been input.' })

    .option('marked-smartLists',  { flag: true, 'default': false,
            help: 'Use smarter list behavior than the original markdown.' })

    .option('marked-smartypants', { flag: true, 'default': false,
            help: 'Use \'smart\' typograhic punctuation for things like quotes and dashes.' })

    .parse()
;

/**
 * Transform parameters to object
 *
 * @param {String|String[]} filters
 * @returns {Object}
 */
function transformToObject(filters) {
    if ( ! filters)
        return;

    if (typeof(filters) === 'string')
        filters = [ filters ];

    var result = {};
    filters.forEach(function(filter) {
        var splits = filter.split('=');
        if (splits.length === 2) {
            var obj = {};
            result[splits[0]] = path.resolve(splits[1], '');
        }
    });
    return result;
}

function generateSchemes(schemes) {
    return (schemes) ? schemes.split(',') : ['http']
}

/**
 * Sets configuration for markdown
 *
 * @param {Array} argv
 * @returns {Object}
 */
function resolveMarkdownOptions(argv) {
    if (argv['marked-config']) {
        return require(path.resolve(argv['marked-config']));
    } else {
        return {
            gfm        : argv['marked-gfm'],
            tables     : argv['marked-tables'],
            breaks     : argv['marked-breaks'],
            pedantic   : argv['marked-pedantic'],
            sanitize   : argv['marked-sanitize'],
            smartLists : argv['marked-smartLists'],
            smartypants: argv['marked-smartypants']
        };
    }
}

var options = {
    excludeFilters  : argv['exclude-filters'],
    includeFilters  : argv['file-filters'],
    src             : argv['input'],
    dest            : argv['output'],
    verbose         : argv['verbose'],
    debug           : argv['debug'],
    host            : argv['host'],
    defaultResponse : argv['default-response'],
    basePath        : argv['base-path'],
    schemes         : generateSchemes(argv['schemes']),
    parse           : argv['parse'],
    colorize        : argv['color'],
    filters         : transformToObject(argv['parse-filters']),
    languages       : transformToObject(argv['parse-languages']),
    parsers         : transformToObject(argv['parse-parsers']),
    workers         : transformToObject(argv['parse-workers']),
    silent          : argv['silent'],
    simulate        : argv['simulate'],
    markdown        : argv['markdown'],
    marked          : resolveMarkdownOptions(argv)
};

if (apidocSwagger.createApidocSwagger(options) === false) {
    process.exit(1);
}
