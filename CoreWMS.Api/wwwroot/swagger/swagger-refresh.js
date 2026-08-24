(function () {
    window.addEventListener('load', function () {
        const timer = setInterval(() => {
            if (window.ui) {
                clearInterval(timer);

                const config = window.ui.getConfigs();
                const originalResponseInterceptor = config.responseInterceptor;

                config.responseInterceptor = async function (response) {
                    // 1. Captura e armazena os tokens automaticamente no Login ou Refresh
                    if (response.url.includes('/api/identity/login') || response.url.includes('/api/identity/refresh-token')) {
                        if (response.status === 200 && response.text) {
                            try {
                                const data = JSON.parse(response.text);
                                if (data.accessToken && data.refreshToken) {
                                    localStorage.setItem('corewms_access_token', data.accessToken);
                                    localStorage.setItem('corewms_refresh_token', data.refreshToken);

                                    // Preenche o botão Authorize do Swagger automaticamente após o Login
                                    window.ui.preauthorizeApiKey('Bearer', 'Bearer ' + data.accessToken);
                                    console.log('[Swagger Auth] Tokens capturados e salvos no LocalStorage.');
                                }
                            } catch (e) { }
                        }
                    }

                    // 2. Intercepta requisições com 401 Unauthorized e renova o Token automaticamente
                    if (response.status === 401 && !response.url.includes('/api/identity/refresh-token') && !response.url.includes('/api/identity/login')) {
                        const refreshToken = localStorage.getItem('corewms_refresh_token');
                        const accessToken = localStorage.getItem('corewms_access_token');

                        if (refreshToken && accessToken) {
                            console.warn('[Swagger Auth] Token expirado (401). Solicitando Refresh Token...');

                            try {
                                const refreshResponse = await fetch('/api/identity/refresh-token', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ accessToken: accessToken, refreshToken: refreshToken })
                                });

                                if (refreshResponse.ok) {
                                    const newData = await refreshResponse.json();

                                    // Atualiza LocalStorage e o cabeçalho Bearer do Swagger UI
                                    localStorage.setItem('corewms_access_token', newData.accessToken);
                                    localStorage.setItem('corewms_refresh_token', newData.refreshToken);
                                    window.ui.preauthorizeApiKey('Bearer', 'Bearer ' + newData.accessToken);

                                    console.log('[Swagger Auth] Token renovado com sucesso! Reenviando requisição original...');

                                    // Re-executa a requisição original com o novo token JWT
                                    const req = response.request;
                                    req.headers['Authorization'] = 'Bearer ' + newData.accessToken;
                                    return await window.ui.fn.execute(req);
                                } else {
                                    console.error('[Swagger Auth] Refresh Token expirado ou inválido. Realize um novo login.');
                                }
                            } catch (err) {
                                console.error('[Swagger Auth] Erro ao tentar renovar o token:', err);
                            }
                        }
                    }

                    return originalResponseInterceptor ? originalResponseInterceptor(response) : response;
                };
            }
        }, 100);
    });
})();