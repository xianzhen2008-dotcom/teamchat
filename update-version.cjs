#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, 'dist', 'index.html');
const ROOT_INDEX_FILE = path.join(__dirname, 'index.html');

function getCurrentVersion() {
    const content = fs.readFileSync(INDEX_FILE, 'utf-8');
    const match = content.match(/v=(\d+)/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return 150;
}

function updateVersion(newVersion) {
    const files = [INDEX_FILE, ROOT_INDEX_FILE];
    
    for (const file of files) {
        if (!fs.existsSync(file)) continue;
        
        let content = fs.readFileSync(file, 'utf-8');
        
        content = content.replace(/v=\d+/g, `v=${newVersion}`);
        content = content.replace(
            /<span class="version-info" id="version-info">[^<]*<\/span>/,
            `<span class="version-info" id="version-info">v${newVersion}</span>`
        );
        
        fs.writeFileSync(file, content);
        console.log(`Updated ${file} to v${newVersion}`);
    }
}

function main() {
    const args = process.argv.slice(2);
    let newVersion;
    
    if (args.length > 0) {
        if (args[0] === '--increment' || args[0] === '-i') {
            const current = getCurrentVersion();
            newVersion = current + 1;
        } else {
            newVersion = parseInt(args[0], 10);
        }
    } else {
        const current = getCurrentVersion();
        newVersion = current + 1;
    }
    
    if (isNaN(newVersion)) {
        console.error('Invalid version number');
        process.exit(1);
    }
    
    updateVersion(newVersion);
    console.log(`Version updated to v${newVersion}`);
}

main();
