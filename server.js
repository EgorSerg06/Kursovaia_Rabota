// ==================== БИБЛИОТЕКИ ====================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { db, initDatabase } = require('./database');

// ==================== НАСТРОЙКИ ====================

const app = express();
const PORT = 3000;
const JWT_SECRET = 'my-secret-key-12345';

// ==================== MIDDLEWARE ====================

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

initDatabase();

// ==================== ПРОВЕРКА АВТОРИЗАЦИИ ====================

const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Нет токена авторизации' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Неверный или просроченный токен' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }
        next();
    };
};

// ==================== АВТОРИЗАЦИЯ ====================

app.post('/api/register', (req, res) => {
    const { phone, password, name, role = 'client' } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const sql = `INSERT INTO users (phone, password, name, role) VALUES (?, ?, ?, ?)`;
    
    db.run(sql, [phone, hashedPassword, name, role], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Этот телефон уже зарегистрирован' });
            }
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        res.status(201).json({ id: this.lastID, message: 'Пользователь создан' });
    });
});

app.post('/api/login', (req, res) => {
    const { phone, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE phone = ?`, [phone], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Неверный телефон или пароль' });
        }
        
        const isValid = bcrypt.compareSync(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный телефон или пароль' });
        }
        
        const token = jwt.sign(
            { userId: user.id, role: user.role }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        res.json({ 
            token, 
            user: { id: user.id, name: user.name, role: user.role } 
        });
    });
});

// ==================== МЕНЮ ====================

app.get('/api/menu', (req, res) => {
    const { category, search } = req.query;
    
    let sql = `SELECT * FROM menu_items WHERE is_available = 1`;
    const params = [];
    
    if (category) {
        sql += ` AND category_id = ?`;
        params.push(category);
    }
    
    if (search) {
        sql += ` AND (name LIKE ? OR description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/menu/all', authenticate, requireRole(['admin']), (req, res) => {
    db.all(`SELECT * FROM menu_items ORDER BY category_id, name`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/categories', (req, res) => {
    db.all(`SELECT * FROM categories ORDER BY sort_order`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==================== КОРЗИНА ====================

app.post('/api/cart', authenticate, (req, res) => {
    const { item_id, quantity = 1 } = req.body;
    const user_id = req.user.userId;
    
    db.get(`SELECT * FROM carts WHERE user_id = ? AND item_id = ?`, [user_id, item_id], (err, existing) => {
        if (existing) {
            db.run(`UPDATE carts SET quantity = quantity + ? WHERE id = ?`, [quantity, existing.id], function(err) {
                res.json({ message: 'Количество обновлено' });
            });
        } else {
            db.run(`INSERT INTO carts (user_id, item_id, quantity) VALUES (?, ?, ?)`,
            [user_id, item_id, quantity], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Добавлено в корзину' });
            });
        }
    });
});

app.get('/api/cart', authenticate, (req, res) => {
    db.all(`
        SELECT c.id, c.quantity, mi.name, mi.price, (mi.price * c.quantity) as total
        FROM carts c
        JOIN menu_items mi ON c.item_id = mi.id
        WHERE c.user_id = ?
    `, [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const total = rows.reduce((sum, item) => sum + item.total, 0);
        res.json({ items: rows, total });
    });
});

app.delete('/api/cart/:id', authenticate, (req, res) => {
    db.run(`DELETE FROM carts WHERE id = ? AND user_id = ?`, 
    [req.params.id, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Удалено из корзины' });
    });
});

app.patch('/api/cart/:id', authenticate, (req, res) => {
    const { quantity } = req.body;
    
    if (quantity < 1) {
        return res.status(400).json({ error: 'Количество не может быть меньше 1' });
    }
    
    db.run(`UPDATE carts SET quantity = ? WHERE id = ? AND user_id = ?`,
    [quantity, req.params.id, req.user.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Количество обновлено' });
    });
});

// ==================== ЗАКАЗЫ ====================

app.post('/api/orders', authenticate, requireRole(['client']), (req, res) => {
    const { address, phone } = req.body;
    const user_id = req.user.userId;
    
    db.all(`
        SELECT c.*, mi.price, mi.is_available, mi.name
        FROM carts c 
        JOIN menu_items mi ON c.item_id = mi.id 
        WHERE c.user_id = ?
    `, [user_id], (err, cartItems) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (cartItems.length === 0) {
            return res.status(400).json({ error: 'Корзина пуста' });
        }
        
        const unavailable = cartItems.filter(item => !item.is_available);
        if (unavailable.length > 0) {
            return res.status(400).json({ 
                error: 'Некоторые блюда недоступны',
                items: unavailable.map(i => ({ id: i.item_id, name: i.name }))
            });
        }
        
        const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        db.run(
            `INSERT INTO orders (user_id, total_price, address, phone) VALUES (?, ?, ?, ?)`,
            [user_id, total, address, phone], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                
                const orderId = this.lastID;
                
                const stmt = db.prepare(`
                    INSERT INTO order_items (order_id, item_id, quantity, price_at_moment) 
                    VALUES (?, ?, ?, ?)
                `);
                
                cartItems.forEach(item => {
                    stmt.run(orderId, item.item_id, item.quantity, item.price);
                });
                stmt.finalize();
                
                db.run(`DELETE FROM carts WHERE user_id = ?`, [user_id]);
                
                res.status(201).json({ 
                    orderId, 
                    total, 
                    message: 'Заказ успешно создан' 
                });
            }
        );
    });
});

app.get('/api/orders/my', authenticate, (req, res) => {
    db.all(`
        SELECT * FROM orders
        WHERE user_id = ?
        ORDER BY created_at DESC
    `, [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/orders', authenticate, requireRole(['operator', 'admin']), (req, res) => {
    const { status } = req.query;
    
    let sql = `
        SELECT o.*, u.name as client_name, u.phone as client_phone
        FROM orders o
        JOIN users u ON o.user_id = u.id
    `;
    const params = [];
    
    if (status) {
        sql += ` WHERE o.status = ?`;
        params.push(status);
    }
    
    sql += ` ORDER BY o.created_at DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.patch('/api/orders/:id/status', authenticate, requireRole(['operator', 'admin']), (req, res) => {
    const { status, courier_id } = req.body;
    const orderId = req.params.id;
    
    const validStatuses = ['new', 'cooking', 'on_the_way', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Неверный статус. Допустимые: ' + validStatuses.join(', ') });
    }
    
    // Если назначаем "в пути" — нужен курьер
    if (status === 'on_the_way') {
        if (!courier_id) {
            return res.status(400).json({ error: 'Укажите курьера для статуса "в пути"' });
        }
        
        // Проверяем, что курьер существует
        db.get(`SELECT * FROM users WHERE id = ? AND role = 'courier'`, [courier_id], (err, courier) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!courier) return res.status(400).json({ error: 'Курьер не найден' });
            
            // Обновляем заказ: статус + курьер
            db.run(`UPDATE orders SET status = ?, courier_id = ? WHERE id = ?`, 
            [status, courier_id, orderId], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Заказ не найден' });
                }
                
                // Считаем и сохраняем начисление курьеру
                db.get(`SELECT total_price FROM orders WHERE id = ?`, [orderId], (err, order) => {
                    if (!err && order) {
                        const percent = calculateCourierCommission(order.total_price);
                        const earnings = Math.round(order.total_price * percent);
                        
                        db.run(`INSERT INTO courier_earnings (order_id, courier_id, order_total, commission_percent, earnings) 
                                VALUES (?, ?, ?, ?, ?)`,
                        [orderId, courier_id, order.total_price, Math.round(percent * 100), earnings]);
                    }
                });
                
                res.json({ message: `Статус изменён на "${status}", назначен курьер` });
            });
        });
    } else {
        // Обычное обновление статуса
        db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Заказ не найден' });
            }
            res.json({ message: `Статус изменён на "${status}"` });
        });
    }
});

// ==================== КУРЬЕР ====================

// Курьер видит заказы со статусом "on_the_way", назначенные ему
app.get('/api/courier/orders', authenticate, requireRole(['courier']), (req, res) => {
    db.all(`
        SELECT o.*, u.name as client_name, u.phone as client_phone
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.courier_id = ? AND o.status = 'on_the_way'
        ORDER BY o.created_at DESC
    `, [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Курьер видит ВСЕ свои заказы (доставленные + в пути)
app.get('/api/courier/history', authenticate, requireRole(['courier']), (req, res) => {
    db.all(`
        SELECT o.*, u.name as client_name
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.courier_id = ?
        ORDER BY o.created_at DESC
    `, [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Курьер ставит статус "delivered"
app.patch('/api/courier/orders/:id/deliver', authenticate, requireRole(['courier']), (req, res) => {
    const orderId = req.params.id;
    const courierId = req.user.userId;
    
    // Проверяем, что заказ назначен этому курьеру
    db.get(`SELECT * FROM orders WHERE id = ? AND courier_id = ?`, [orderId, courierId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Заказ не найден или не назначен вам' });
        if (order.status !== 'on_the_way') {
            return res.status(400).json({ error: 'Заказ не в статусе "в пути"' });
        }
        
        db.run(`UPDATE orders SET status = 'delivered' WHERE id = ?`, [orderId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Заказ доставлен! ✅' });
        });
    });
});

// Расчёт наценки курьера
function calculateCourierCommission(total) {
    return total < 1000 ? 0.25 : 0.15; // 25% или 15%
}

// Сводка курьера (Dashboard)
app.get('/api/courier/stats', authenticate, requireRole(['courier']), (req, res) => {
    const courierId = req.user.userId;
    
    // Всего заработано
    db.get(`SELECT COALESCE(SUM(earnings), 0) as total_earned FROM courier_earnings WHERE courier_id = ?`, 
    [courierId], (err, earnedRow) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Всего доставлено
        db.get(`SELECT COUNT(*) as total_delivered FROM orders WHERE courier_id = ? AND status = 'delivered'`, 
        [courierId], (err, deliveredRow) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Сейчас в пути
            db.get(`SELECT COUNT(*) as on_the_way FROM orders WHERE courier_id = ? AND status = 'on_the_way'`, 
            [courierId], (err, wayRow) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json({
                    total_earned: earnedRow.total_earned,
                    total_delivered: deliveredRow.total_delivered,
                    on_the_way: wayRow.on_the_way
                });
            });
        });
    });
});

// Список курьеров (для оператора — чтобы назначить)
app.get('/api/couriers', authenticate, requireRole(['operator', 'admin']), (req, res) => {
    db.all(`SELECT id, name, phone FROM users WHERE role = 'courier' ORDER BY name`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ==================== АДМИН: УПРАВЛЕНИЕ МЕНЮ ====================

app.post('/api/menu', authenticate, requireRole(['admin']), (req, res) => {
    const { category_id, name, description, price, image_url } = req.body;
    
    if (!name || !price) {
        return res.status(400).json({ error: 'Название и цена обязательны' });
    }
    
    db.run(`
        INSERT INTO menu_items (category_id, name, description, price, image_url) 
        VALUES (?, ?, ?, ?, ?)
    `, [category_id, name, description, price, image_url], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Блюдо добавлено' });
    });
});

app.patch('/api/menu/:id/availability', authenticate, requireRole(['admin']), (req, res) => {
    const { is_available } = req.body;
    const itemId = req.params.id;
    
    db.run(`UPDATE menu_items SET is_available = ? WHERE id = ?`, 
    [is_available ? 1 : 0, itemId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Доступность обновлена' });
    });
});

app.delete('/api/menu/:id', authenticate, requireRole(['admin']), (req, res) => {
    db.run(`DELETE FROM menu_items WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Блюдо не найдено' });
        }
        res.json({ message: 'Блюдо удалено' });
    });
});


// ==================== АДМИН: КАТЕГОРИИ ====================

// Создать новую категорию
app.post('/api/categories', authenticate, requireRole(['admin']), (req, res) => {
    const { name, sort_order = 0 } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Название категории обязательно' });
    }
    
    db.run(`INSERT INTO categories (name, sort_order) VALUES (?, ?)`,
    [name, sort_order], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, message: 'Категория создана' });
    });
});

// Удалить категорию
app.delete('/api/categories/:id', authenticate, requireRole(['admin']), (req, res) => {
    // Проверяем, есть ли блюда в категории
    db.get(`SELECT COUNT(*) as count FROM menu_items WHERE category_id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (row.count > 0) {
            return res.status(400).json({ error: 'Нельзя удалить категорию с блюдами' });
        }
        
        db.run(`DELETE FROM categories WHERE id = ?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Категория не найдена' });
            res.json({ message: 'Категория удалена' });
        });
    });
});

// ==================== АДМИН: УПРАВЛЕНИЕ СОТРУДНИКАМИ ====================

// Получить всех сотрудников (кроме клиентов)
app.get('/api/staff', authenticate, requireRole(['admin']), (req, res) => {
    db.all(`SELECT id, name, phone, role FROM users WHERE role IN ('operator', 'courier', 'admin') ORDER BY role, name`, 
    (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Создать сотрудника
app.post('/api/staff', authenticate, requireRole(['admin']), (req, res) => {
    const { phone, password, name, role } = req.body;
    
    if (!['operator', 'courier', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Неверная роль' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run(`INSERT INTO users (phone, password, name, role) VALUES (?, ?, ?, ?)`,
    [phone, hashedPassword, name, role], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Этот телефон уже зарегистрирован' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, message: 'Сотрудник создан' });
    });
});

// Удалить сотрудника (кроме себя)
app.delete('/api/staff/:id', authenticate, requireRole(['admin']), (req, res) => {
    const staffId = req.params.id;
    
    // Нельзя удалить самого себя
    if (parseInt(staffId) === req.user.userId) {
        return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    
    db.run(`DELETE FROM users WHERE id = ? AND role IN ('operator', 'courier')`, 
    [staffId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Сотрудник не найден или нельзя удалить' });
        }
        res.json({ message: 'Сотрудник удалён' });
    });
});


// ==================== ЗАГРУЗКА КАРТИНОК ====================

const fs = require('fs');
const path = require('path');

// Создаём папку для картинок, если её нет
const imgDir = path.join(__dirname, 'public', 'img');
if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
}

// Загрузка картинки (multipart/form-data)
app.post('/api/upload', authenticate, requireRole(['admin']), (req, res) => {
    // Простая загрузка: принимаем base64 или сохраняем файл
    // Для простоты — сохраняем base64 как файл
    const { image, filename } = req.body;
    
    if (!image || !filename) {
        return res.status(400).json({ error: 'Нужны image (base64) и filename' });
    }
    
    // Убираем префикс data:image/...;base64,
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const safeFilename = Date.now() + '_' + filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filepath = path.join(imgDir, safeFilename);
    
    fs.writeFile(filepath, buffer, (err) => {
        if (err) return res.status(500).json({ error: 'Ошибка сохранения файла' });
        res.json({ url: '/img/' + safeFilename, filename: safeFilename });
    });
});


// ==================== DASHBOARD (НОВОЕ) ====================
// 3 цифры для админ-панели: заказы, выручка, блюда

app.get('/api/dashboard', authenticate, requireRole(['admin']), (req, res) => {
    // Считаем всё по очереди (SQLite не поддерживает async/await)
    db.get(`SELECT COUNT(*) as total_orders FROM orders`, (err, ordersRow) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get(`SELECT COALESCE(SUM(total_price), 0) as revenue FROM orders WHERE status = 'delivered'`, (err, revenueRow) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.get(`SELECT COUNT(*) as menu_items FROM menu_items WHERE is_available = 1`, (err, menuRow) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json({
                    total_orders: ordersRow.total_orders,
                    revenue: revenueRow.revenue,
                    menu_items: menuRow.menu_items
                });
            });
        });
    });
});

// ==================== ЗАПУСК ====================

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📋 API: http://localhost:${PORT}/api/...`);
    console.log(`🧪 Тесты: http://localhost:${PORT}/tests.html`);
    console.log(`🍕 Сайт: http://localhost:${PORT}`);
});