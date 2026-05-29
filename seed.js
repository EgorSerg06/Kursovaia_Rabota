const { db, initDatabase } = require('./database');
const bcrypt = require('bcryptjs');

// Сначала создаём таблицы
initDatabase();

setTimeout(() => {
    console.log('⏳ Заполняем тестовыми данными...');
    
    // Проверяем, есть ли уже данные
    db.get(`SELECT COUNT(*) as count FROM menu_items`, (err, row) => {
        if (row && row.count > 0) {
            console.log('⚠️ Данные уже есть в базе, пропускаем заполнение');
            db.close();
            return;
        }
        
        // Категории
        const categories = ['Пицца', 'Суши', 'Бургеры', 'Напитки', 'Десерты'];
        const catStmt = db.prepare(`INSERT INTO categories (name, sort_order) VALUES (?, ?)`);
        categories.forEach((name, i) => catStmt.run(name, i));
        catStmt.finalize();
        
        // Блюда
        setTimeout(() => {
            const items = [
            [1, 'Маргарита', 'Классическая пицца с томатами и моцареллой', 450, 1, '/img/pizza-margherita.jpg'],
            [1, 'Пепперони', 'Острая пицца с пепперони и сыром', 520, 1, '/img/pizza-pepperoni.jpg'],
            [1, 'Четыре сыра', 'Пицца с моцареллой, пармезаном, горгонзолой и чеддером', 580, 1, '/img/pizza-cheese.jpg'],
            [2, 'Филадельфия', 'Ролл с лососем, сыром филадельфия и огурцом', 380, 1, '/img/sushi.jpg'],
            [2, 'Калифорния', 'Ролл с крабом, авокадо и икрой тобико', 420, 1, '/img/sushi2.jpg'],
            [3, 'Чизбургер', 'Бургер с говяжьей котлетой, сыром чеддер и соусом', 290, 1, '/img/burger.jpg'],
            [3, 'Биг Бургер', 'Двойная котлета, двойной сыр, бекон', 450, 1, '/img/burger2.jpg'],
            [4, 'Кола 0.5л', 'Газированный напиток Coca-Cola', 120, 1, '/img/cola.jpg'],
            [4, 'Сок апельсиновый', 'Натуральный апельсиновый сок 0.3л', 150, 1, '/img/juice.jpg'],
            [5, 'Чизкейк', 'Классический чизкейк Нью-Йорк', 280, 1, '/img/cheesecake.jpg'],
            [5, 'Тирамису', 'Итальянский десерт с маскарпоне', 320, 1, '/img/tiramisu.jpg']
            ];
            
            const itemStmt = db.prepare(`INSERT INTO menu_items (category_id, name, description, price, is_available, image_url) VALUES (?, ?, ?, ?, ?, ?)`);
            items.forEach(item => itemStmt.run(item));
            itemStmt.finalize();
            
            // Тестовый админ
            const adminHash = bcrypt.hashSync('admin123', 10);
            db.run(`INSERT OR IGNORE INTO users (phone, password, name, role) VALUES (?, ?, ?, ?)`,
            ['admin', adminHash, 'Администратор', 'admin']);
            
            // Тестовый оператор
            const operatorHash = bcrypt.hashSync('operator123', 10);
            db.run(`INSERT OR IGNORE INTO users (phone, password, name, role) VALUES (?, ?, ?, ?)`,
            ['operator', operatorHash, 'Оператор', 'operator']);
            
            // Тестовый клиент
            const clientHash = bcrypt.hashSync('client123', 10);
            db.run(`INSERT OR IGNORE INTO users (phone, password, name, role, address) VALUES (?, ?, ?, ?, ?)`,
            ['client', clientHash, 'Иван Клиентов', 'client', 'ул. Ленина, 1']);
            
            // Тестовый курьер
            const courierHash = bcrypt.hashSync('courier123', 10);
            db.run(`INSERT OR IGNORE INTO users (phone, password, name, role, address) VALUES (?, ?, ?, ?, ?)`,
            ['courier', courierHash, 'Пётр Курьеров', 'courier', 'ул. Курьерская, 5']);


            console.log('✅ Тестовые данные добавлены!');
            console.log('');
            console.log('🔑 Тестовые аккаунты:');
            console.log('   Админ:     phone=admin,     password=admin123');
            console.log('   Оператор:  phone=operator,  password=operator123');
            console.log('   Клиент:    phone=client,    password=client123');
            
            db.close();
        }, 500);
    });
}, 1000);