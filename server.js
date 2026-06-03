const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { ZipArchive } = require('archiver');

const app = express();
const PORT = 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure base uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve front-end files from /public
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Allow-list sanitization: keep alphanumeric, @, dot, hyphen, underscore, plus.
 * This prevents path traversal and invalid filesystem characters.
 */
function sanitizeFolderName(name) {
    if (!name || typeof name !== 'string') return 'default';
    const sanitized = name
        .trim()
        .replace(/[^a-zA-Z0-9@._\-+]/g, '_') // replace disallowed chars
        .replace(/^[._]+|[._]+$/g, '')        // strip leading/trailing dots or underscores
        .substring(0, 200);
    return sanitized || 'default';
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Use memory storage so req.body is reliably populated before we create the folder
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

app.post('/upload', upload.array('images', 50), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No images received.' });
        }

        const parentName  = req.body.parent ? sanitizeFolderName(req.body.parent) : '';
        const folderName  = sanitizeFolderName(req.body.identifier);
        const folderPath  = parentName
            ? path.join(UPLOADS_DIR, parentName, folderName)
            : path.join(UPLOADS_DIR, folderName);

        // Guard against path traversal even after sanitization
        const resolvedFolder  = path.resolve(folderPath);
        const resolvedUploads = path.resolve(UPLOADS_DIR);
        if (!resolvedFolder.startsWith(resolvedUploads + path.sep)) {
            return res.status(400).json({ success: false, message: 'Invalid folder path.' });
        }

        fs.mkdirSync(resolvedFolder, { recursive: true });

        // Determine the next sequential number by inspecting existing files
        const IMAGE_EXT   = /\.(jpg|jpeg|png|gif|webp|bmp|avif|tiff?)$/i;
        const existing    = fs.readdirSync(resolvedFolder).filter(f => IMAGE_EXT.test(f));
        const numPattern  = new RegExp(`^${escapeRegex(folderName)}_(\\d+)`, 'i');
        let nextNum = existing.reduce((max, f) => {
            const m = f.match(numPattern);
            return m ? Math.max(max, parseInt(m[1], 10) + 1) : max;
        }, 1);

        const savedFiles = req.files.map((file, i) => {
            const ext      = path.extname(file.originalname).toLowerCase() || '.jpg';
            const filename = `${folderName}_${nextNum + i}${ext}`;
            fs.writeFileSync(path.join(resolvedFolder, filename), file.buffer);
            return filename;
        });

        const displayPath = parentName ? `${parentName}/${folderName}` : folderName;
        res.json({
            success: true,
            message: `${savedFiles.length} image(s) saved to "${displayPath}"`,
            folder: folderName,
            parent: parentName || null,
            path:   displayPath,
            files:  savedFiles
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// List all existing upload folders with their image counts
app.get('/folders', (_req, res) => {
    try {
        if (!fs.existsSync(UPLOADS_DIR)) {
            return res.json({ folders: [] });
        }
        const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|avif|tiff?)$/i;
        const entries   = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .sort((a, b) => a.name.localeCompare(b.name));

        const folders = entries.map(e => {
            const entryPath  = path.join(UPLOADS_DIR, e.name);
            const subEntries = fs.readdirSync(entryPath, { withFileTypes: true });
            const directCount = subEntries.filter(s => !s.isDirectory() && IMAGE_EXT.test(s.name)).length;
            const children    = subEntries
                .filter(s => s.isDirectory())
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(s => {
                    const count = fs.readdirSync(path.join(entryPath, s.name))
                        .filter(f => IMAGE_EXT.test(f)).length;
                    return { name: s.name, path: `${e.name}/${s.name}`, count };
                });
            return { name: e.name, path: e.name, count: directCount, children };
        });
        res.json({ folders });
    } catch (err) {
        res.status(500).json({ folders: [], error: err.message });
    }
});

// Create empty folders from a comma/newline-delimited list
app.post('/folders/create', express.json(), (req, res) => {
    try {
        const raw = req.body?.names;
        if (!raw || typeof raw !== 'string') {
            return res.status(400).json({ success: false, message: 'No names provided.' });
        }
        const parentName = req.body.parent ? sanitizeFolderName(req.body.parent) : '';
        const names = raw
            .split(/[,\n]+/)
            .map(n => sanitizeFolderName(n.trim()))
            .filter(n => n && n !== 'default');

        if (names.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid folder names found.' });
        }

        const resolvedUploads = path.resolve(UPLOADS_DIR);
        const created = [], skipped = [];

        names.forEach(name => {
            const folderPath = path.resolve(
                parentName ? path.join(UPLOADS_DIR, parentName, name) : path.join(UPLOADS_DIR, name)
            );
            if (!folderPath.startsWith(resolvedUploads + path.sep)) return;
            if (fs.existsSync(folderPath)) {
                skipped.push(name);
            } else {
                fs.mkdirSync(folderPath, { recursive: true });
                created.push(name);
            }
        });

        const parts = [];
        if (created.length) parts.push(`${created.length} folder(s) created`);
        if (skipped.length) parts.push(`${skipped.length} already existed`);
        res.json({ success: true, message: parts.join(', ') + '.', created, skipped });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// Download entire uploads folder as a zip
app.get('/download', (_req, res) => {
    if (!fs.existsSync(UPLOADS_DIR) || fs.readdirSync(UPLOADS_DIR).length === 0) {
        return res.status(404).json({ success: false, message: 'No uploads found.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="uploads.zip"');

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on('error', err => {
        console.error('Archive error:', err);
        if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);
    archive.directory(UPLOADS_DIR, 'uploads');
    archive.finalize();
});

// Download a single folder or nested folder as a zip
app.get('/download/*', (req, res) => {
    try {
        const segments    = req.params[0].split('/').map(s => sanitizeFolderName(s)).filter(Boolean);
        if (segments.length < 1 || segments.length > 2) {
            return res.status(400).json({ success: false, message: 'Invalid path.' });
        }
        const folderPath    = path.resolve(path.join(UPLOADS_DIR, ...segments));
        const resolvedUploads = path.resolve(UPLOADS_DIR);
        if (!folderPath.startsWith(resolvedUploads + path.sep)) {
            return res.status(400).json({ success: false, message: 'Invalid folder path.' });
        }
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ success: false, message: 'Folder not found.' });
        }
        const zipName = segments.join('_');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`);
        const archive = new ZipArchive({ zlib: { level: 6 } });
        archive.on('error', err => {
            console.error('Archive error:', err);
            if (!res.headersSent) res.status(500).end();
        });
        archive.pipe(res);
        archive.directory(folderPath, segments[segments.length - 1]);
        archive.finalize();
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// Delete a single folder or nested folder
app.delete('/folders/*', (req, res) => {
    try {
        const segments   = req.params[0].split('/').map(s => sanitizeFolderName(s)).filter(Boolean);
        if (segments.length < 1 || segments.length > 2) {
            return res.status(400).json({ success: false, message: 'Invalid path.' });
        }
        const folderPath = path.resolve(path.join(UPLOADS_DIR, ...segments));
        const resolvedUploads = path.resolve(UPLOADS_DIR);
        if (!folderPath.startsWith(resolvedUploads + path.sep)) {
            return res.status(400).json({ success: false, message: 'Invalid folder path.' });
        }
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ success: false, message: 'Folder not found.' });
        }
        fs.rmSync(folderPath, { recursive: true, force: true });
        res.json({ success: true, message: `"${segments.join('/')}" deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// Delete all folders
app.delete('/folders', (_req, res) => {
    try {
        if (!fs.existsSync(UPLOADS_DIR)) {
            return res.json({ success: true, message: 'Nothing to delete.' });
        }
        const entries = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true })
            .filter(e => e.isDirectory());
        entries.forEach(e => fs.rmSync(path.join(UPLOADS_DIR, e.name), { recursive: true, force: true }));
        res.json({ success: true, message: `${entries.length} folder(s) deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// Multer error handler (file size / type rejections)
app.use((err, _req, res, _next) => {
    res.status(400).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
    // Resolve the local LAN IP so users know the network address
    // const { networkInterfaces } = require('os');
    // const lanIp = Object.values(networkInterfaces())
    //     .flat()
    //     .find(iface => iface.family === 'IPv4' && !iface.internal)?.address ?? 'unknown';

    console.log(`Image Uploader running on:`);
    console.log(`  Local   → http://localhost:${PORT}`);
    // console.log(`  Network → http://${lanIp}:${PORT}  (share this with other devices)`);
});
