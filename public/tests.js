const API_URL = 'http://localhost:3000/api';

let passed = 0;
let total = 0;

async function runTests() {
    passed = 0;
    total = 0;
    document.getElementById('tests-list').innerHTML = '';
    document.getElementById('final-result').classList.add('hidden');

    // Тест 1: Меню доступно без авторизации
    await test('GET /menu — меню доступно без входа', async () => {
        const res = await fetch(API_URL + '/menu');
        return res.ok;
    });

    // Тест 2: Категории загружаются
    await test('GET /categories — категории загружаются', async () => {
        const res = await fetch(API_URL + '/categories');
        const data = await res.json();
        return res.ok && data.length > 0;
    });

    // Тест 3: Регистрация нового пользователя
    const testPhone = 'test' + Date.now();
    let testToken = '';

    await test('POST /register — регистрация работает', async () => {
        const res = await fetch(API_URL + '/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: testPhone,
                password: 'test123',
                name: 'Тестовый'
            })
        });
        return res.ok;
    });

    // Тест 4: Вход
    await test('POST /login — вход работает', async () => {
        const res = await fetch(API_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone, password: 'test123' })
        });
        const data = await res.json();
        testToken = data.token;
        return res.ok && data.token;
    });

    // Тест 5: Корзина требует авторизацию (без токена)
    await test('POST /cart — корзина требует авторизацию', async () => {
        const res = await fetch(API_URL + '/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: 1, quantity: 1 })
        });
        return res.status === 401;
    });

    // Тест 6: Добавление в корзину (с токеном)
    await test('POST /cart — добавление в корзину работает', async () => {
        const res = await fetch(API_URL + '/cart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + testToken
            },
            body: JSON.stringify({ item_id: 1, quantity: 1 })
        });
        return res.ok;
    });

    // Тест 7: Получение корзины
    await test('GET /cart — корзина загружается', async () => {
        const res = await fetch(API_URL + '/cart', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        const data = await res.json();
        return res.ok && data.items;
    });

    // Тест 8: Сумма заказа считается правильно
    await test('Сумма заказа — 450 ₽ за 1 шт. Маргариты', async () => {
        const res = await fetch(API_URL + '/cart', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        const data = await res.json();
        return data.total === 450;
    });

    // Тест 9: Оформление заказа
    await test('POST /orders — оформление заказа работает', async () => {
        const res = await fetch(API_URL + '/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + testToken
            },
            body: JSON.stringify({ address: 'ул. Тестовая, 1', phone: '+79999999999' })
        });
        return res.ok;
    });

    // Тест 10: История заказов
    await test('GET /orders/my — история заказов загружается', async () => {
        const res = await fetch(API_URL + '/orders/my', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        const data = await res.json();
        return res.ok && Array.isArray(data);
    });

    // Тест 11: Админ-эндпоинт требует роль admin
    await test('GET /menu/all — требует роль админа', async () => {
        const res = await fetch(API_URL + '/menu/all', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        return res.status === 403;
    });

    // Тест 12: Недоступные блюда не показываются в меню
    await test('Недоступные блюда скрыты из меню', async () => {
        const res = await fetch(API_URL + '/menu');
        const data = await res.json();
        return data.every(item => item.is_available === 1);
    });

    // Итог
    const resultDiv = document.getElementById('final-result');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `
        <div>✅ Пройдено: ${passed} / ${total}</div>
        <div style="margin-top: 10px; font-size: 18px;">
            ${passed === total ? '🎉 Все тесты пройдены!' : '⚠️ Есть ошибки'}
        </div>
    `;
}

async function test(name, fn) {
    total++;
    let success = false;
    try {
        success = await fn();
    } catch (e) {
        console.error('Test error:', e);
    }

    if (success) passed++;

    const div = document.createElement('div');
    div.className = 'test-item';
    div.innerHTML = `
        <span class="test-name">${name}</span>
        <span class="test-status ${success ? 'pass' : 'fail'}">
            ${success ? '✅' : '❌'}
        </span>
    `;
    document.getElementById('tests-list').appendChild(div);
}