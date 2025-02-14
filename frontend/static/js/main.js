document.addEventListener('DOMContentLoaded', () => {
    // Instantiate the globe
    const globe = new Globe(document.getElementById('globe-container'));
    
    // Define exchanges
    const exchanges = {
        'binance': {
            name: 'Binance',
            lat: 35.6762,
            lon: 139.6503,
            location: 'Tokyo, Japan'
        },
        'coinbase': {
            name: 'Coinbase',
            lat: 37.7749,
            lon: -122.4194,
            location: 'San Francisco, USA'
        },
        'kraken': {
            name: 'Kraken',
            lat: 37.7749,
            lon: -122.4194,
            location: 'San Francisco, USA'
        },
        'kucoin': {
            name: 'KuCoin',
            lat: 1.3521,
            lon: 103.8198,
            location: 'Singapore'
        },
        'huobi': {
            name: 'Huobi',
            lat: 35.6762,
            lon: 139.6503,
            location: 'Tokyo, Japan'
        },
        'bitfinex': {
            name: 'Bitfinex',
            lat: 22.3964,
            lon: 114.1095,
            location: 'Hong Kong'
        },
        'bybit': {
            name: 'Bybit',
            lat: 1.3521,
            lon: 103.8198,
            location: 'Singapore'
        },
        'okx': {
            name: 'OKX',
            lat: 35.6762,
            lon: 139.6503,
            location: 'Tokyo, Japan'
        },
        'gate': {
            name: 'Gate.io',
            lat: 35.6762,
            lon: 139.6503,
            location: 'Tokyo, Japan'
        },
        'mexc': {
            name: 'MEXC',
            lat: 1.3521,
            lon: 103.8198,
            location: 'Singapore'
        }
    };

    // Add each exchange to the globe
    Object.entries(exchanges).forEach(([id, exchange]) => {
        globe.addExchange(
            exchange.lat,
            exchange.lon,
            exchange.name,
            { location: exchange.location }
        );
    });

    // Default token
    let currentToken = 'BTC';
    
    // Token selector functionality (assumes token buttons exist with class 'token-button')
    document.querySelectorAll('.token-button').forEach(button => {
        button.addEventListener('click', () => {
            currentToken = button.dataset.token;
            document.querySelectorAll('.token-button').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            
            // If an order book is already open, update it with the new token
            const openExchange = document.querySelector('#order-book-panel[data-exchange]');
            if (openExchange) {
                updateOrderBookDisplay(openExchange.dataset.exchange);
            }
        });
    });
    
    // --- Create and Insert Exchange Selector ---
    // Assume that your token selector is contained within an element with the class "token-selector".
    // Adjust the selector if your DOM structure differs.
    const tokenSelector = document.querySelector('.token-selector');
    const exchangeSelector = document.createElement('div');
    exchangeSelector.id = 'exchange-selector';
    // Style properties can be overridden by your CSS; inline here for clarity:
    exchangeSelector.style.width = '100%';
    exchangeSelector.style.maxHeight = '300px';
    exchangeSelector.style.overflowY = 'auto';
    exchangeSelector.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    exchangeSelector.style.color = 'white';
    exchangeSelector.style.padding = '10px';
    exchangeSelector.style.borderRadius = '5px';
    exchangeSelector.style.marginTop = '10px';
    
    // Populate exchange list
    exchangeSelector.innerHTML = Object.entries(exchanges)
        .map(([id, ex]) => `<div class="exchange-selector-item" data-exchange="${id}" style="cursor:pointer; margin-bottom:5px;">${ex.name}</div>`)
        .join('');
    
    // Insert the exchange selector immediately after the token selector, or append to body if not found
    if (tokenSelector) {
        tokenSelector.insertAdjacentElement('afterend', exchangeSelector);
    } else {
        document.body.appendChild(exchangeSelector);
    }
    
    // Attach click handlers to each exchange selector item
    document.querySelectorAll('.exchange-selector-item').forEach(item => {
        item.addEventListener('click', () => {
            const exchangeId = item.dataset.exchange;
            // Update the order book display
            updateOrderBookDisplay(exchangeId);
            // Pan the globe to the selected exchange's location.
            const exData = exchanges[exchangeId];
            if (exData) {
                // Use globe.latLongToVector3 to compute the position on the globe's surface.
                const newTarget = globe.latLongToVector3(exData.lat, exData.lon, 100);
                // Set the OrbitControls target to the new position and update.
                globe.controls.target.copy(newTarget);
                globe.controls.update();
            }
        });
    });
    // --- End Exchange Selector Code ---
    
    // --- Setup WebSocket Connection ---
    const ws = new WebSocket(`ws://${window.location.host}/ws/orderbook`);
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Update globe markers for the current token.
        Object.entries(data).forEach(([exchange, tokens]) => {
            if (exchanges[exchange] && tokens[currentToken]) {
                globe.updateExchangeData(exchanges[exchange].name, {
                    price: tokens[currentToken].bid_price,
                    bid: tokens[currentToken].bid_price,
                    ask: tokens[currentToken].ask_price
                });
            }
        });

        // Update the exchange data in the info panel.
        const exchangeDataElement = document.getElementById('exchange-data');
        if (exchangeDataElement) {
            exchangeDataElement.innerHTML = Object.entries(data)
                .map(([exchange, tokens]) => {
                    const exchangeInfo = exchanges[exchange];
                    if (!exchangeInfo || !tokens[currentToken]) return '';
                    
                    return `
                        <div class="exchange-price">
                            <h3>${exchangeInfo.name}</h3>
                            <p>Location: ${exchangeInfo.location}</p>
                            <p>Bid: $${tokens[currentToken].bid_price.toLocaleString()}</p>
                            <p>Ask: $${tokens[currentToken].ask_price.toLocaleString()}</p>
                        </div>
                    `;
                })
                .join('');
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed');
        if (!ws.reconnecting) {
            ws.reconnecting = true;
            setTimeout(() => {
                ws = new WebSocket(`ws://${window.location.host}/ws/orderbook`);
                ws.onmessage = event => {
                    ws.reconnecting = false;
                    handleWebSocketMessage(event);
                };
                ws.onerror = ws.onerror;
                ws.onclose = ws.onclose;
            }, 5000);
        }
    };
    
    function handleWebSocketMessage(event) {
        const data = JSON.parse(event.data);
        updateGlobeAndInfo(data);
    }
    
    // --- Order Book & Depth Chart Panels ---
    const orderBookPanel = document.createElement('div');
    orderBookPanel.id = 'order-book-panel';
    orderBookPanel.style.display = 'none';
    document.body.appendChild(orderBookPanel);

    const depthChartPanel = document.createElement('div');
    depthChartPanel.id = 'depth-chart-panel';
    document.body.appendChild(depthChartPanel);

    window.addEventListener('exchange-selected', (event) => {
        const exchangeName = event.detail.exchange;
        const exchangeId = Object.entries(exchanges).find(
            ([, data]) => data.name === exchangeName
        )?.[0];

        if (exchangeId) {
            updateOrderBookDisplay(exchangeId);
        }
    });

    let currentExchangeInterval = null;
    function updateOrderBookDisplay(exchangeId) {
        closeOrderBook();
        
        const orderBookPanel = document.getElementById('order-book-panel');
        const depthChartPanel = document.getElementById('depth-chart-panel');
        
        orderBookPanel.style.display = 'block';
        depthChartPanel.style.display = 'block';
        
        orderBookPanel.dataset.exchange = exchangeId;
        
        orderBookPanel.innerHTML = `
            <div class="order-book-header">
                <h2>${exchanges[exchangeId].name} - ${currentToken}/USDT Order Book</h2>
                <button class="close-button" onclick="closeOrderBook()">×</button>
            </div>
            <div class="order-book-content">
                <div>Loading...</div>
            </div>
        `;
        
        depthChartPanel.innerHTML = `<div class="order-book-histogram" id="orderbook-histogram">Loading...</div>`;

        fetchAndUpdateOrderBook(exchangeId);
        currentExchangeInterval = setInterval(() => fetchAndUpdateOrderBook(exchangeId), 1000);
    }

    function closeOrderBook() {
        const orderBookPanel = document.getElementById('order-book-panel');
        const depthChartPanel = document.getElementById('depth-chart-panel');
        
        if (currentExchangeInterval) {
            clearInterval(currentExchangeInterval);
            currentExchangeInterval = null;
        }
        
        orderBookPanel.style.display = 'none';
        depthChartPanel.style.display = 'none';
        orderBookPanel.dataset.exchange = '';
    }
    
    function shouldUseDenseMode(bids, asks, tickSize) {
        const bestBid = Math.max(...bids.map(b => Number(b[0])));
        const bestAsk = Math.min(...asks.map(a => Number(a[0])));
        const spread = bestAsk - bestBid;
        return (spread / tickSize) < 10;
    }

    function drawHistogram(histogramData, containerId) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        container.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        const prices = Object.keys(histogramData).map(Number).sort((a, b) => a - b);
        
        // Filter prices with non-zero volumes
        const bidPricesWithVolume = prices.filter(p => histogramData[p].bidVolume > 0);
        const askPricesWithVolume = prices.filter(p => histogramData[p].askVolume > 0);
        
        // Calculate best bid (maximum) and best ask (minimum)
        const bestBid = bidPricesWithVolume.length > 0 ? Math.max(...bidPricesWithVolume) : 0;
        const bestAsk = askPricesWithVolume.length > 0 ? Math.min(...askPricesWithVolume) : 0;
        const midPrice = (bestBid + bestAsk) / 2;
        
        const maxVolume = Math.max(...Object.values(histogramData).map(bin => 
            Math.max(Math.log10(bin.bidVolume + 1), Math.log10(bin.askVolume + 1))
        ));
        
        const margin = {
            top: 20,
            right: 50,
            bottom: 70,
            left: 60
        };
        
        const plotWidth = canvas.width - margin.left - margin.right;
        const plotHeight = canvas.height - margin.top - margin.bottom;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#444';
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, canvas.height - margin.bottom);
        ctx.lineTo(canvas.width - margin.right, canvas.height - margin.bottom);
        ctx.stroke();
        
        const barWidth = Math.min(15, plotWidth / prices.length);
        
        prices.forEach((price, i) => {
            const x = margin.left + (i * (plotWidth / (prices.length - 1)));
            const y = canvas.height - margin.bottom;
            const { bidVolume, askVolume } = histogramData[price];
            
            if (price <= midPrice && bidVolume > 0) {
                ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
                const height = (Math.log10(bidVolume + 1) / maxVolume) * plotHeight;
                ctx.fillRect(x - barWidth/2, y - height, barWidth, height);
            }
            if (price >= midPrice && askVolume > 0) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                const height = (Math.log10(askVolume + 1) / maxVolume) * plotHeight;
                ctx.fillRect(x - barWidth/2, y - height, barWidth, height);
            }
            
            if (i % Math.ceil(prices.length / 20) === 0) {
                ctx.save();
                ctx.fillStyle = '#888';
                ctx.font = '10px Arial';
                ctx.textAlign = 'right';
                ctx.translate(x, y + 25);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(price.toLocaleString(undefined, {
                    minimumFractionDigits: currentToken === 'XRP' ? 4 : 2,
                    maximumFractionDigits: currentToken === 'XRP' ? 4 : 2
                }), 0, 0);
                ctx.restore();
            }
        });
        
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const volume = Math.pow(10, (maxVolume * i / 5)).toFixed(2);
            const y = canvas.height - margin.bottom - (plotHeight * i / 5);
            ctx.fillText(volume, margin.left - 5, y + 4);
        }
        
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Price ($)', canvas.width / 2, canvas.height);
        ctx.save();
        ctx.translate(15, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Volume (log scale)', 0, 0);
        ctx.restore();
    }

    function fetchAndUpdateOrderBook(exchangeId) {
        fetch(`/api/orderbook/${currentToken}/USDT/${exchangeId}`)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(data => {
                if (data.error) throw new Error(data.error);
                
                const allBids = JSON.parse(data.bids || '[]');
                const allAsks = JSON.parse(data.asks || '[]');
                // Limit the order book data to the top 50 entries for each side
                const bids = allBids.slice(0, 50);
                const asks = allAsks.slice(0, 50);
                
                const priceDecimals = currentToken === 'XRP' ? 4 : 2;
                
                const orderBookPanel = document.getElementById('order-book-panel');
                orderBookPanel.innerHTML = `
                    <div class="order-book-header">
                        <h2>${exchanges[exchangeId].name} - ${currentToken}/USDT Order Book</h2>
                        <button class="close-button" onclick="closeOrderBook()">×</button>
                    </div>
                    <div class="order-book-content">
                        <div class="bids">
                            <h3>Bids</h3>
                            ${bids.map(([price, size]) => `
                                <div class="order-row">
                                    <span class="price">${Number(price).toLocaleString(undefined, {
                                        minimumFractionDigits: priceDecimals,
                                        maximumFractionDigits: priceDecimals
                                    })}</span>
                                    <span class="size">${Number(size).toLocaleString(undefined, {
                                        minimumFractionDigits: 4,
                                        maximumFractionDigits: 4
                                    })}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="asks">
                            <h3>Asks</h3>
                            ${asks.map(([price, size]) => `
                                <div class="order-row">
                                    <span class="price">${Number(price).toLocaleString(undefined, {
                                        minimumFractionDigits: priceDecimals,
                                        maximumFractionDigits: priceDecimals
                                    })}</span>
                                    <span class="size">${Number(size).toLocaleString(undefined, {
                                        minimumFractionDigits: 4,
                                        maximumFractionDigits: 4
                                    })}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="timestamp">
                        Last updated: ${new Date(data.timestamp).toLocaleTimeString()}
                    </div>
                `;
                
                const tickSize = calculateTickSize(bids, asks);
                const histogramData = createHistogramData(bids, asks, tickSize);
                drawHistogram(histogramData, 'orderbook-histogram');
            })
            .catch(error => {
                console.error('Error:', error);
                showError(
                    document.getElementById('order-book-panel'),
                    document.getElementById('depth-chart-panel'),
                    exchanges[exchangeId].name,
                    error.message
                );
            });
    }

    function showError(orderBookPanel, depthChartPanel, exchangeName, errorMessage) {
        orderBookPanel.innerHTML = `
            <div class="order-book-header">
                <h2>${exchangeName} Order Book</h2>
                <button class="close-button" onclick="closeOrderBook()">×</button>
            </div>
            <div class="order-book-content">
                <div class="error">Error loading order book data: ${errorMessage}</div>
            </div>
        `;
        depthChartPanel.innerHTML = `
            <div class="error">Error loading depth chart: ${errorMessage}</div>
        `;
    }

    function calculateTickSize(bids, asks) {
        const prices = [...bids, ...asks].map(([price]) => Number(price));
        let minDiff = Infinity;
        prices.sort((a, b) => a - b);
        for (let i = 1; i < prices.length; i++) {
            const diff = prices[i] - prices[i-1];
            if (diff > 0 && diff < minDiff) {
                minDiff = diff;
            }
        }
        return minDiff;
    }
    
    function createHistogramData(bids, asks, tickSize) {
        const bidPrices = bids.map(([price]) => Number(price));
        const askPrices = asks.map(([price]) => Number(price));
        
        // Token-specific parameters
        const tokenConfig = {
            'XRP': { tickSize: 0.0001, padding: 0.0001, decimals: 4 },
            'BTC': { tickSize: 0.01, padding: 0.01, decimals: 2 },
            'ETH': { tickSize: 0.01, padding: 0.01, decimals: 2 },
            'SOL': { tickSize: 0.0001, padding: 0.01, decimals: 2 }
        };
        const config = tokenConfig[currentToken];
        
        const minPrice = Math.min(...bidPrices) - config.padding;
        const maxPrice = Math.max(...askPrices) + config.padding;
        
        // Calculate midprice using best bid and best ask
        const midPrice = (Math.min(...askPrices) + Math.max(...bidPrices)) / 2;
        const relativeTickSize = (config.tickSize / midPrice) * 100;
        
        const bins = {};
        for (let price = minPrice; price <= maxPrice; price += config.tickSize) {
            const roundedPrice = Math.round(price * Math.pow(10, config.decimals)) / Math.pow(10, config.decimals);
            bins[roundedPrice] = { bidVolume: 0, askVolume: 0 };
        }
        
        bids.forEach(([price, size]) => {
            const roundedPrice = Math.round(Number(price) * Math.pow(10, config.decimals)) / Math.pow(10, config.decimals);
            if (bins[roundedPrice]) {
                bins[roundedPrice].bidVolume = Number(size);
            }
        });
        
        asks.forEach(([price, size]) => {
            const roundedPrice = Math.round(Number(price) * Math.pow(10, config.decimals)) / Math.pow(10, config.decimals);
            if (bins[roundedPrice]) {
                bins[roundedPrice].askVolume = Number(size);
            }
        });
        
        // Optionally add a graph label into the exchange-data container
        const exchangeDataElement = document.getElementById('exchange-data');
        if (exchangeDataElement) {
            exchangeDataElement.innerHTML = '';
            const graphElement = document.createElement('div');
            graphElement.id = 'graph';
            graphElement.style.position = 'relative';
            exchangeDataElement.appendChild(graphElement);
            const label = document.createElement('div');
            label.innerText = `Relative Tick Size: ${relativeTickSize.toFixed(6)}%`;
            // Use a valid position property; e.g., absolute
            label.style.position = 'absolute';
            label.style.top = '5px';
            label.style.right = '10px';
            label.style.backgroundColor = 'black';
            label.style.padding = '5px';
            label.style.color = 'white';
            graphElement.appendChild(label);
        }
        
        return bins;
    }
    
    // Expose closeOrderBook globally
    window.closeOrderBook = closeOrderBook;
});