// ===== Flow Money - Servidor del simulador de intercambio =====
// Backend con cuentas, login por sesión y transferencias entre usuarios.
// Persistencia en data.json (sin base de datos externa).

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());

// ===== Tasas de cambio (base USD), mismas que la landing =====
const RATES = {
    USD: 1, EUR: 0.92, MXN: 17.25, ARS: 875.50, COP: 3950.00,
    CLP: 885.00, PEN: 3.72, BRL: 4.97, VES: 36.50, UYU: 39.25,
    PYG: 7350.00, BOB: 6.91, PAB: 1.00, CRC: 525.00, DOP: 58.50, GBP: 0.79
};

// ===== Datos iniciales =====
function seedData() {
    const evaluador = (n, password) => ({
        username: `evaluador${n}`,
        password,
        name: `Evaluador ${['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis'][n - 1]}`,
        balances: { USD: 5000, EUR: 2000, CLP: 1000000, MXN: 10000 }
    });

    return {
        accounts: [
            evaluador(1, 'flow101'),
            evaluador(2, 'flow102'),
            evaluador(3, 'flow103'),
            evaluador(4, 'flow104'),
            evaluador(5, 'flow105'),
            evaluador(6, 'flow106'),
            {
                username: 'demo',
                password: 'demo123',
                name: 'Cuenta Demo',
                balances: { USD: 3000, EUR: 1000, CLP: 500000, MXN: 5000 }
            }
        ],
        transactions: []
    };
}

function loadData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        const data = seedData();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return data;
    }
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();

// ===== Sesiones en memoria: token -> username =====
const sessions = new Map();

function parseCookies(req) {
    const header = req.headers.cookie || '';
    const cookies = {};
    header.split(';').forEach(part => {
        const idx = part.indexOf('=');
        if (idx > -1) cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    });
    return cookies;
}

function getSessionUser(req) {
    const token = parseCookies(req)['fm_token'];
    if (!token) return null;
    const username = sessions.get(token);
    if (!username) return null;
    return data.accounts.find(a => a.username === username) || null;
}

function requireAuth(req, res, next) {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'No autenticado' });
    req.user = user;
    next();
}

function publicUser(account) {
    return { username: account.username, name: account.name, balances: account.balances };
}

function convert(amount, fromCurrency, toCurrency) {
    // amount en fromCurrency -> equivalente en toCurrency (vía USD)
    return (amount / RATES[fromCurrency]) * RATES[toCurrency];
}

// ===== API =====

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const account = data.accounts.find(a => a.username === String(username || '').trim().toLowerCase());

    if (!account || account.password !== password) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, account.username);
    res.setHeader('Set-Cookie', `fm_token=${token}; HttpOnly; Path=/; SameSite=Lax`);
    res.json({ user: publicUser(account) });
});

app.post('/api/logout', (req, res) => {
    const token = parseCookies(req)['fm_token'];
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'fm_token=; HttpOnly; Path=/; Max-Age=0');
    res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

app.get('/api/users', requireAuth, (req, res) => {
    const others = data.accounts
        .filter(a => a.username !== req.user.username)
        .map(a => ({ username: a.username, name: a.name }));
    res.json({ users: others });
});

app.get('/api/rates', (req, res) => {
    res.json({ base: 'USD', rates: RATES });
});

app.get('/api/transactions', requireAuth, (req, res) => {
    const txs = data.transactions
        .filter(t => t.from === req.user.username || t.to === req.user.username)
        .slice()
        .reverse();
    res.json({ transactions: txs });
});

app.post('/api/transfer', requireAuth, (req, res) => {
    const { to, fromCurrency, toCurrency, amount } = req.body || {};
    const value = Number(amount);

    const recipient = data.accounts.find(a => a.username === to);
    if (!recipient) return res.status(400).json({ error: 'Cuenta destino no existe' });
    if (recipient.username === req.user.username) return res.status(400).json({ error: 'No puedes transferirte a ti mismo' });
    if (!RATES[fromCurrency] || !RATES[toCurrency]) return res.status(400).json({ error: 'Moneda no válida' });
    if (!isFinite(value) || value <= 0) return res.status(400).json({ error: 'Monto no válido' });

    const senderBalance = req.user.balances[fromCurrency] || 0;
    if (value > senderBalance) {
        return res.status(400).json({ error: `Fondos insuficientes. Tienes ${senderBalance.toFixed(2)} ${fromCurrency}` });
    }

    const received = convert(value, fromCurrency, toCurrency);

    req.user.balances[fromCurrency] = +(senderBalance - value).toFixed(2);
    recipient.balances[toCurrency] = +(((recipient.balances[toCurrency] || 0) + received)).toFixed(2);

    const tx = {
        id: crypto.randomBytes(8).toString('hex'),
        type: 'transfer',
        from: req.user.username,
        fromName: req.user.name,
        to: recipient.username,
        toName: recipient.name,
        amountSent: value,
        currencySent: fromCurrency,
        amountReceived: +received.toFixed(2),
        currencyReceived: toCurrency,
        rate: +(RATES[toCurrency] / RATES[fromCurrency]).toFixed(6),
        date: new Date().toISOString()
    };
    data.transactions.push(tx);
    saveData();

    res.json({ ok: true, transaction: tx, balances: req.user.balances });
});

// Intercambio de divisas dentro de la propia cuenta
app.post('/api/exchange', requireAuth, (req, res) => {
    const { fromCurrency, toCurrency, amount } = req.body || {};
    const value = Number(amount);

    if (!RATES[fromCurrency] || !RATES[toCurrency]) return res.status(400).json({ error: 'Moneda no válida' });
    if (fromCurrency === toCurrency) return res.status(400).json({ error: 'Elige dos monedas distintas' });
    if (!isFinite(value) || value <= 0) return res.status(400).json({ error: 'Monto no válido' });

    const balance = req.user.balances[fromCurrency] || 0;
    if (value > balance) {
        return res.status(400).json({ error: `Fondos insuficientes. Tienes ${balance.toFixed(2)} ${fromCurrency}` });
    }

    const received = convert(value, fromCurrency, toCurrency);

    req.user.balances[fromCurrency] = +(balance - value).toFixed(2);
    req.user.balances[toCurrency] = +(((req.user.balances[toCurrency] || 0) + received)).toFixed(2);

    const tx = {
        id: crypto.randomBytes(8).toString('hex'),
        type: 'exchange',
        from: req.user.username,
        fromName: req.user.name,
        to: req.user.username,
        toName: req.user.name,
        amountSent: value,
        currencySent: fromCurrency,
        amountReceived: +received.toFixed(2),
        currencyReceived: toCurrency,
        rate: +(RATES[toCurrency] / RATES[fromCurrency]).toFixed(6),
        date: new Date().toISOString()
    };
    data.transactions.push(tx);
    saveData();

    res.json({ ok: true, transaction: tx, balances: req.user.balances });
});

// Reinicia cuentas e historial (útil entre ensayos del tribunal)
app.post('/api/reset', requireAuth, (req, res) => {
    data = seedData();
    saveData();
    const account = data.accounts.find(a => a.username === req.user.username);
    res.json({ ok: true, user: publicUser(account) });
});

// ===== Archivos estáticos =====
app.use(express.static(__dirname));

app.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    const lanIps = [];
    Object.values(nets).forEach(list => {
        (list || []).forEach(net => {
            if (net.family === 'IPv4' && !net.internal) lanIps.push(net.address);
        });
    });

    console.log('');
    console.log('  Flow Money - Simulador de intercambio');
    console.log('  ------------------------------------');
    console.log(`  Local:    http://localhost:${PORT}`);
    lanIps.forEach(ip => console.log(`  Red LAN:  http://${ip}:${PORT}  <- abrir esto en el otro notebook`));
    console.log('');
});
