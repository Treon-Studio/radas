const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// If canvas is installed, we can generate crisp PNG, or we can build raw 22x22 base64 PNG!
// Let's create a raw 16x16 / 22x22 PNG buffer for the RADAS pixel logo shape!
