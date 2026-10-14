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
    USD: 1, EUR: 0.92, MXN: 17.25, ARS: 875.50,
    COP: 3950.00, CLP: 885.00, PEN: 3.72, VES: 36.50
};

// ===== Datos iniciales =====
function seedData() {
    const evaluador = (n, password) => ({
        username: `evaluador${n}`,
        password,
        name: ['Adriana Umpierrez', 'Bertha Doumat', 'Dafne Cuevas', 'Diana Canal', 'Juan David Guerra', 'Robin Henao'][n - 1],
        balances: { USD: 5000, EUR: 2000, CLP: 1000000, MXN: 10000, COP: 500000, PEN: 500, ARS: 100000, VES: 1000 }
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
                name: 'Nicolás Sánchez',
                balances: { USD: 3000, EUR: 1000, CLP: 500000, MXN: 5000, COP: 250000, PEN: 250, ARS: 50000, VES: 500 }
            }
        ],
        transactions: [],
        orders: []
    };
}

function loadData() {
    try {
        const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        if (!Array.isArray(parsed.orders)) parsed.orders = [];
        if (!Array.isArray(parsed.transactions)) parsed.transactions = [];
        return parsed;
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

// Comisión de la plataforma: 0,75 % por usuario (1,5 % por operación)
const FEE = 0.0075;

function publicOrder(order) {
    return {
        id: order.id,
        status: order.status,
        maker: order.maker,
        makerName: order.makerName,
        giveAmount: order.giveAmount,
        giveCurrency: order.giveCurrency,
        wantCurrency: order.wantCurrency,
        takerPay: order.takerPay,          // lo que paga quien acepta (wantCurrency)
        takerReceive: order.takerReceive,  // lo que recibe quien acepta (giveCurrency, menos 0,75 %)
        makerReceive: order.makerReceive,  // lo que recibe el creador (wantCurrency, menos 0,75 %)
        taker: order.taker || null,
        takerName: order.takerName || null,
        date: order.date,
        completedAt: order.completedAt || null
    };
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

// ===== Mercado P2P: ofertas de intercambio entre usuarios con escrow =====

// Listar mercado: ofertas abiertas de otros + mis ofertas (todas)
app.get('/api/orders', requireAuth, (req, res) => {
    const open = data.orders
        .filter(o => o.status === 'open' && o.maker !== req.user.username)
        .slice().reverse();
    const mine = data.orders
        .filter(o => o.maker === req.user.username || o.taker === req.user.username)
        .slice().reverse().slice(0, 20);
    res.json({ open: open.map(publicOrder), mine: mine.map(publicOrder) });
});

// Publicar oferta: los fondos quedan bloqueados en custodia (escrow)
app.post('/api/orders', requireAuth, (req, res) => {
    const { giveCurrency, wantCurrency, amount } = req.body || {};
    const value = Number(amount);

    if (!RATES[giveCurrency] || !RATES[wantCurrency]) return res.status(400).json({ error: 'Moneda no válida' });
    if (giveCurrency === wantCurrency) return res.status(400).json({ error: 'Elige dos monedas distintas' });
    if (!isFinite(value) || value <= 0) return res.status(400).json({ error: 'Monto no válido' });

    const balance = req.user.balances[giveCurrency] || 0;
    if (value > balance) {
        return res.status(400).json({ error: `Fondos insuficientes. Tienes ${balance.toFixed(2)} ${giveCurrency}` });
    }

    const market = convert(value, giveCurrency, wantCurrency);

    // Escrow: la plataforma custodia los fondos del creador hasta completarse
    req.user.balances[giveCurrency] = +(balance - value).toFixed(2);

    const order = {
        id: crypto.randomBytes(8).toString('hex'),
        status: 'open',
        maker: req.user.username,
        makerName: req.user.name,
        giveAmount: value,
        giveCurrency,
        wantCurrency,
        takerPay: +market.toFixed(2),
        takerReceive: +(value * (1 - FEE)).toFixed(2),
        makerReceive: +(market * (1 - FEE)).toFixed(2),
        date: new Date().toISOString()
    };
    data.orders.push(order);
    saveData();

    res.json({ ok: true, order: publicOrder(order), balances: req.user.balances });
});

// Aceptar oferta: ambos depósitos verificados, liberación simultánea
app.post('/api/orders/:id/accept', requireAuth, (req, res) => {
    const order = data.orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Oferta no existe' });
    if (order.status !== 'open') return res.status(400).json({ error: 'La oferta ya no está disponible' });
    if (order.maker === req.user.username) return res.status(400).json({ error: 'No puedes aceptar tu propia oferta' });

    const takerBalance = req.user.balances[order.wantCurrency] || 0;
    if (order.takerPay > takerBalance) {
        return res.status(400).json({ error: `Fondos insuficientes. Necesitas ${order.takerPay.toFixed(2)} ${order.wantCurrency}` });
    }

    const maker = data.accounts.find(a => a.username === order.maker);
    if (!maker) return res.status(400).json({ error: 'La cuenta creadora ya no existe' });

    // Liberación simultánea desde el escrow a ambas partes
    req.user.balances[order.wantCurrency] = +(takerBalance - order.takerPay).toFixed(2);
    req.user.balances[order.giveCurrency] = +(((req.user.balances[order.giveCurrency] || 0) + order.takerReceive)).toFixed(2);
    maker.balances[order.wantCurrency] = +(((maker.balances[order.wantCurrency] || 0) + order.makerReceive)).toFixed(2);

    order.status = 'completed';
    order.taker = req.user.username;
    order.takerName = req.user.name;
    order.completedAt = new Date().toISOString();

    const base = {
        rate: +(RATES[order.wantCurrency] / RATES[order.giveCurrency]).toFixed(6),
        date: order.completedAt
    };
    data.transactions.push(
        {
            ...base,
            id: crypto.randomBytes(8).toString('hex'),
            type: 'p2p',
            from: req.user.username,
            fromName: req.user.name,
            to: maker.username,
            toName: maker.name,
            amountSent: order.giveAmount,
            currencySent: order.giveCurrency,
            amountReceived: order.makerReceive,
            currencyReceived: order.wantCurrency
        },
        {
            ...base,
            id: crypto.randomBytes(8).toString('hex'),
            type: 'p2p',
            from: maker.username,
            fromName: maker.name,
            to: req.user.username,
            toName: req.user.name,
            amountSent: order.takerPay,
            currencySent: order.wantCurrency,
            amountReceived: order.takerReceive,
            currencyReceived: order.giveCurrency
        }
    );
    saveData();

    res.json({ ok: true, order: publicOrder(order), balances: req.user.balances });
});

// Cancelar oferta abierta: el escrow devuelve los fondos al creador
app.post('/api/orders/:id/cancel', requireAuth, (req, res) => {
    const order = data.orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Oferta no existe' });
    if (order.maker !== req.user.username) return res.status(403).json({ error: 'Solo el creador puede cancelarla' });
    if (order.status !== 'open') return res.status(400).json({ error: 'La oferta ya no está abierta' });

    req.user.balances[order.giveCurrency] = +(((req.user.balances[order.giveCurrency] || 0) + order.giveAmount)).toFixed(2);
    order.status = 'cancelled';
    saveData();

    res.json({ ok: true, order: publicOrder(order), balances: req.user.balances });
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
