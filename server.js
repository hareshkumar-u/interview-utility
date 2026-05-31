const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

        const folderName = sanitizeFolderName(req.body.identifier);
        const folderPath = path.join(UPLOADS_DIR, folderName);

        // Guard against path traversal even after sanitization
        const resolvedFolder = path.resolve(folderPath);
        const resolvedUploads = path.resolve(UPLOADS_DIR);
        if (!resolvedFolder.startsWith(resolvedUploads + path.sep)) {
            return res.status(400).json({ success: false, message: 'Invalid folder name.' });
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

        res.json({
            success: true,
            message: `${savedFiles.length} image(s) saved to folder "${folderName}"`,
            folder: folderName,
            files: savedFiles
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
        const entries   = fs.readdirSync(UPLOADS_DIR, { withFileTypes: true });
        const folders   = entries
            .filter(e => e.isDirectory())
            .map(e => {
                const files = fs.readdirSync(path.join(UPLOADS_DIR, e.name))
                    .filter(f => IMAGE_EXT.test(f));
                return { name: e.name, count: files.length };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json({ folders });
    } catch (err) {
        res.status(500).json({ folders: [], error: err.message });
    }
});

// Multer error handler (file size / type rejections)
app.use((err, _req, res, _next) => {
    res.status(400).json({ success: false, message: err.message });
});

app.listen(PORT, async () => {
    console.log(`Image Uploader running on:`);
    console.log(`  Local   → http://localhost:${PORT}`);
});
