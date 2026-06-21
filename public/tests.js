const API_URL = `${window.location.origin}/api`;

let passed = 0;
let total = 0;

async function runTests() {
    passed = 0;
    total = 0;
    document.getElementById('tests-list').innerHTML = '';
    document.getElementById('final-result').classList.add('hidden');

    await test('GET /menu — меню доступно без входа', async () => {
        const res = await fetch(API_URL + '/menu');
        return res.ok;
    });

    await test('GET /categories — категории загружаются', async () => {
        const res = await fetch(API_URL + '/categories');
        const data = await res.json();
        return res.ok && data.length > 0;
    });

    const testPhone = 'test' + Date.now();
    let testToken = '';
    let orderId = null;

    await test('POST /register — регистрация работает', async () => {
        const res = await fetch(API_URL + '/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone, password: 'test123', name: 'Тестовый' })
        });
        return res.ok;
    });

    await test('POST /register — нельзя зарегистрироваться как admin', async () => {
        const hackPhone = 'hack' + Date.now();
        const res = await fetch(API_URL + '/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: hackPhone, password: 'test123', name: 'Хакер', role: 'admin' })
        });
        if (!res.ok) return false;
        const loginRes = await fetch(API_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: hackPhone, password: 'test123' })
        });
        const data = await loginRes.json();
        return loginRes.ok && data.user.role === 'client';
    });

    await test('POST /login — вход работает', async () => {
        const res = await fetch(API_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: testPhone, password: 'test123' })
        });
        const data = await res.json();
        testToken = data.token;
        return res.ok && data.token && data.user.role === 'client';
    });

    await test('POST /cart — корзина требует авторизацию', async () => {
        const res = await fetch(API_URL + '/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: 1, quantity: 1 })
        });
        return res.status === 401;
    });

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

    await test('GET /cart — корзина загружается', async () => {
        const res = await fetch(API_URL + '/cart', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        const data = await res.json();
        return res.ok && data.items;
    });

    await test('Сумма заказа — 450 ₽ за 1 шт. Маргариты', async () => {
        const res = await fetch(API_URL + '/cart', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        const data = await res.json();
        return data.total === 450;
    });

    await test('POST /orders — оформление заказа работает', async () => {
        const res = await fetch(API_URL + '/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + testToken
            },
            body: JSON.stringify({ address: 'ул. Тестовая, 1', phone: '+79999999999' })
        });
        const data = await res.json();
        orderId = data.orderId;
        return res.ok && orderId;
    });

    await test('GET /orders/:id — состав заказа загружается', async () => {
        const res = await fetch(API_URL + '/orders/' + orderId, {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        const data = await res.json();
        return res.ok && Array.isArray(data.items) && data.items.length > 0;
    });

    await test('GET /orders/my — история заказов загружается', async () => {
        const res = await fetch(API_URL + '/orders/my', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        const data = await res.json();
        return res.ok && Array.isArray(data);
    });

    await test('GET /menu/all — требует роль админа', async () => {
        const res = await fetch(API_URL + '/menu/all', {
            headers: { 'Authorization': 'Bearer ' + testToken }
        });
        return res.status === 403;
    });

    await test('Недоступные блюда скрыты из меню', async () => {
        const res = await fetch(API_URL + '/menu');
        const data = await res.json();
        return data.every(item => item.is_available === 1);
    });

    // Тесты админа
    let adminToken = '';
    await test('POST /login — вход админа', async () => {
        const res = await fetch(API_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: 'admin', password: 'admin123' })
        });
        const data = await res.json();
        adminToken = data.token;
        return res.ok && data.user.role === 'admin';
    });

    await test('GET /dashboard — dashboard админа', async () => {
        const res = await fetch(API_URL + '/dashboard', {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const data = await res.json();
        return res.ok && typeof data.total_orders === 'number';
    });

    await test('GET /menu/all — админ видит все блюда', async () => {
        const res = await fetch(API_URL + '/menu/all', {
            headers: { 'Authorization': 'Bearer ' + adminToken }
        });
        const data = await res.json();
        return res.ok && Array.isArray(data);
    });

    // Тесты оператора
    let operatorToken = '';
    await test('POST /login — вход оператора', async () => {
        const res = await fetch(API_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: 'operator', password: 'operator123' })
        });
        const data = await res.json();
        operatorToken = data.token;
        return res.ok && data.user.role === 'operator';
    });

    await test('GET /orders — оператор видит заказы', async () => {
        const res = await fetch(API_URL + '/orders', {
            headers: { 'Authorization': 'Bearer ' + operatorToken }
        });
        const data = await res.json();
        return res.ok && Array.isArray(data);
    });

    await test('GET /couriers — список курьеров', async () => {
        const res = await fetch(API_URL + '/couriers', {
            headers: { 'Authorization': 'Bearer ' + operatorToken }
        });
        const data = await res.json();
        return res.ok && Array.isArray(data);
    });

    // Тесты курьера
    let courierToken = '';
    await test('POST /login — вход курьера', async () => {
        const res = await fetch(API_URL + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: 'courier', password: 'courier123' })
        });
        const data = await res.json();
        courierToken = data.token;
        return res.ok && data.user.role === 'courier';
    });

    await test('GET /courier/stats — статистика курьера', async () => {
        const res = await fetch(API_URL + '/courier/stats', {
            headers: { 'Authorization': 'Bearer ' + courierToken }
        });
        const data = await res.json();
        return res.ok && typeof data.total_earned === 'number';
    });

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
