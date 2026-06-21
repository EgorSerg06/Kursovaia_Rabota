// Подключаем библиотеку sqlite3
// verbose() — показывает подробные ошибки, полезно при разработке
const sqlite3 = require('sqlite3').verbose();

// path — встроенный модуль Node.js для работы с путями файлов
const path = require('path');

// Создаём файл базы данных cafe.db в той же папке, где лежит database.js
// Если файла нет — SQLite создаст его автоматически
const db = new sqlite3.Database(path.join(__dirname, 'cafe.db'), (err) => {
    if (err) {
        // Если ошибка — выводим в консоль
        console.error('Ошибка подключения к БД:', err);
    } else {
        console.log('✅ Подключено к SQLite');
    }
});

// Функция создания таблиц
// serialize() — выполняет запросы последовательно, один за другим
const initDatabase = () => {
    db.serialize(() => {
        
        // Таблица категорий
        // IF NOT EXISTS — чтобы не падать с ошибкой, если таблица уже есть
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        )`);

        // Таблица блюд
        // FOREIGN KEY — связь: блюдо знает, к какой категории относится
        // is_available: 1 = есть в наличии, 0 = закончилось/убрано из меню
        db.run(`CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            image_url TEXT,
            is_available INTEGER DEFAULT 1,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )`);

        // Таблица пользователей
        // role может быть: 'client' (клиент), 'operator' (оператор), 'admin' (админ)
        // phone уникальный — нельзя зарегистрировать два одинаковых номера
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT,
            role TEXT DEFAULT 'client',
            address TEXT
        )`);

        // Корзина — временное хранилище
        db.run(`CREATE TABLE IF NOT EXISTS carts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (item_id) REFERENCES menu_items(id),
            UNIQUE(user_id, item_id)
        )`);

        // Заказы: new → cooking → on_the_way → delivered (или cancelled)
        // courier_id — кто доставляет (null если ещё не назначен)
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            courier_id INTEGER,
            status TEXT DEFAULT 'new',
            total_price REAL DEFAULT 0,
            address TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (courier_id) REFERENCES users(id)
        )`);

        // Начисления курьерам
        // Сколько курьер заработал с каждого заказа
        db.run(`CREATE TABLE IF NOT EXISTS courier_earnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL UNIQUE,
            courier_id INTEGER NOT NULL,
            order_total REAL NOT NULL,
            commission_percent INTEGER NOT NULL,
            earnings REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (courier_id) REFERENCES users(id)
        )`);

        // Индексы для существующих БД (CREATE TABLE IF NOT EXISTS не добавляет UNIQUE)
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_user_item ON carts(user_id, item_id)`);
        db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_courier_earnings_order ON courier_earnings(order_id)`);

        // Позиции в заказе
        // price_at_moment — цена на момент заказа (если потом цена изменится в меню)
        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price_at_moment REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (item_id) REFERENCES menu_items(id)
        )`);

        console.log('✅ Все таблицы созданы!');
    });
};

// Экспортируем, чтобы использовать в других файлах
// module.exports — стандарт Node.js для "поделиться" переменной/функцией
module.exports = { db, initDatabase };