'use strict';

/**
 * Node.js compatibility entrypoint.
 *
 * The UMD implementation in starter-doctor.browser.js is the single runtime
 * rule source for both the browser and Node.js. Keeping this file as a thin
 * adapter prevents the two entrypoints from silently drifting apart.
 */
module.exports = require('./starter-doctor.browser.js');
