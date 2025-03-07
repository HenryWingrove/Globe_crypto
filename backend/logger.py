import asyncio
import ccxt.async_support as ccxt
from datetime import datetime
import sqlalchemy as sa
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging
import json
import websockets
import hmac
import hashlib
import time
import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database setup
Base = declarative_base()

class OrderBookEntry(Base):
    __tablename__ = 'orderbook_entries'
    
    id = sa.Column(sa.Integer, primary_key=True)
    symbol = sa.Column(sa.String(20))
    timestamp = sa.Column(sa.DateTime, default=datetime.utcnow)
    bid_price = sa.Column(sa.Float)
    bid_quantity = sa.Column(sa.Float)
    ask_price = sa.Column(sa.Float)
    ask_quantity = sa.Column(sa.Float)
    exchange = sa.Column(sa.String(50))
    exchange_location = sa.Column(sa.String(100))
    bids = sa.Column(sa.Text)  # Changed to Text type for larger strings
    asks = sa.Column(sa.Text)  # Changed to Text type for larger strings

class CryptoLogger:
    def __init__(self, symbols=None):
        self.symbols = symbols or ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT']
        self.engine = sa.create_engine('sqlite:///crypto_orderbook.db')
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        
        # Exchange locations and configurations
        self.exchanges_config = {
            'binance': {
                'name': 'Binance',
                'lat': 35.6762,
                'lon': 139.6503,
                'location': 'Tokyo, Japan'
            },
            'coinbase': {
                'name': 'Coinbase',
                'lat': 37.7749,
                'lon': -122.4194,
                'location': 'San Francisco, USA'
            },
            'kraken': {
                'name': 'Kraken',
                'lat': 37.7749,
                'lon': -122.4194,
                'location': 'San Francisco, USA'
            },
            'kucoin': {
                'name': 'KuCoin',
                'lat': 1.3521,
                'lon': 103.8198,
                'location': 'Singapore'
            },
            'huobi': {
                'name': 'Huobi',
                'lat': 35.6762,
                'lon': 139.6503,
                'location': 'Tokyo, Japan'
            },
            'bitfinex': {
                'name': 'Bitfinex',
                'lat': 22.3964,
                'lon': 114.1095,
                'location': 'Hong Kong'
            },
            'bybit': {
                'name': 'Bybit',
                'lat': 1.3521,
                'lon': 103.8198,
                'location': 'Singapore'
            },
            'okx': {
                'name': 'OKX',
                'lat': 35.6762,
                'lon': 139.6503,
                'location': 'Tokyo, Japan'
            },
            'gate': {
                'name': 'Gate.io',
                'lat': 35.6762,
                'lon': 139.6503,
                'location': 'Tokyo, Japan'
            },
            'mexc': {
                'name': 'MEXC',
                'lat': 1.3521,
                'lon': 103.8198,
                'location': 'Singapore'
            }
        }
        
    async def create_exchange(self, exchange_id):
        exchange_class = getattr(ccxt, exchange_id)
        exchange = exchange_class({
            'enableRateLimit': True,
            'asyncio_loop': asyncio.get_event_loop()
        })
        return exchange
        
    async def start_logging(self):
        try:
            # Start CCXT logging
            exchanges = []
            for exchange_id in self.exchanges_config.keys():
                try:
                    exchange = await self.create_exchange(exchange_id)
                    exchanges.append(exchange)
                except Exception as e:
                    logger.error(f"Error creating exchange {exchange_id}: {str(e)}")
            
            # Start Coinbase WebSocket
            coinbase_ws = CoinbaseWebSocket(self.Session(), self.symbols)
            ws_task = asyncio.create_task(coinbase_ws.connect())
            
            # Main CCXT logging loop
            while True:
                tasks = []
                for exchange in exchanges:
                    for symbol in self.symbols:
                        tasks.append(self.fetch_and_process(exchange, symbol))
                
                await asyncio.gather(*tasks, return_exceptions=True)
                await asyncio.sleep(5)
                
        except Exception as e:
            logger.error(f"Main loop error: {str(e)}")
        finally:
            # Close all connections
            for exchange in exchanges:
                try:
                    await exchange.close()
                except:
                    pass
            try:
                await coinbase_ws.close()
            except:
                pass
                    
    async def fetch_and_process(self, exchange, symbol):
        try:
            orderbook = await exchange.fetch_order_book(symbol)
            await self.process_orderbook(orderbook, symbol, exchange.id)
        except Exception as e:
            logger.error(f"Error fetching {symbol} from {exchange.id}: {str(e)}")
            
    async def process_orderbook(self, orderbook, symbol, exchange_id):
        try:
            session = self.Session()
            
            if orderbook['bids'] and orderbook['asks']:
                # Get all levels of bids and asks
                top_bids = orderbook['bids']
                top_asks = orderbook['asks']
                
                exchange_info = self.exchanges_config.get(exchange_id, {})
                
                entry = OrderBookEntry(
                    symbol=symbol,
                    timestamp=datetime.fromtimestamp(orderbook['timestamp']/1000 if orderbook['timestamp'] else datetime.utcnow().timestamp()),
                    bid_price=float(top_bids[0][0]),
                    bid_quantity=float(top_bids[0][1]),
                    ask_price=float(top_asks[0][0]),
                    ask_quantity=float(top_asks[0][1]),
                    exchange=exchange_id,
                    exchange_location=exchange_info.get('location'),
                    bids=json.dumps(top_bids),  # Store all bids
                    asks=json.dumps(top_asks)   # Store all asks
                )
                
                session.add(entry)
                session.commit()
                logger.info(f"Logged {symbol} orderbook data from {exchange_id}")
                
        except Exception as e:
            logger.error(f"Error processing {symbol} data: {str(e)}")
        finally:
            session.close()

class CoinbaseWebSocket:
    def __init__(self, session, symbols):
        self.ws_url = "wss://ws-feed.exchange.coinbase.com"
        self.session = session
        self.symbols = [s.replace('/', '-') for s in symbols]
        
        # Coinbase API credentials
        self.api_key = ""
        self.private_key = ''

    def sign_message(self, timestamp, method, path, body=''):
        message = f'{timestamp}{method}{path}{body}'
        
        # Load the private key
        private_key = serialization.load_pem_private_key(
            self.private_key.encode(),
            password=None,
            backend=default_backend()
        )
        
        # Create the signature using SHA256
        chosen_hash = hashes.SHA256()
        hasher = hashes.Hash(chosen_hash)
        hasher.update(message.encode())
        digest = hasher.finalize()
        
        # Sign the digest
        signature = private_key.sign(
            digest,
            ec.ECDSA(hashes.SHA256())
        )
        
        # Convert DER format to raw R + S format
        r, s = utils.decode_dss_signature(signature)
        raw_signature = r.to_bytes(32, byteorder='big') + s.to_bytes(32, byteorder='big')
        
        return base64.b64encode(raw_signature).decode()

    async def connect(self):
        try:
            print("Attempting to connect to Coinbase WebSocket...")
            self.ws = await websockets.connect(self.ws_url)
            print("Connected successfully!")
            
            # Generate authentication parameters
            timestamp = str(int(time.time()))
            signature = self.sign_message(timestamp, 'GET', '/ws')
            
            # Subscribe with authentication
            subscribe_message = {
                "type": "subscribe",
                "product_ids": self.symbols,
                "channels": ["level2"],
                "signature": signature,
                "key": self.api_key,
                "timestamp": timestamp
            }
            
            print(f"Sending subscribe message: {subscribe_message}")
            await self.ws.send(json.dumps(subscribe_message))
            
            print(f"\nSubscribed to Coinbase L2 data for: {', '.join(self.symbols)}\n")
            
            # Start processing messages
            await self.process_messages()
            
        except Exception as e:
            print(f"Coinbase WebSocket error: {str(e)}")
            logger.error(f"Coinbase WebSocket error: {str(e)}")
            
    async def process_messages(self):
        try:
            while True:
                message = await self.ws.recv()
                print(f"\nRaw message received: {message}\n")  # Print raw message
                
                data = json.loads(message)
                
                if data['type'] == 'snapshot':
                    print(f"\n{'='*50}")
                    print(f"L2 Snapshot for {data['product_id']}:")
                    print(f"Top 5 Bids:")
                    for price, size in data['bids'][:5]:
                        print(f"  Price: {price}, Size: {size}")
                    print(f"Top 5 Asks:")
                    for price, size in data['asks'][:5]:
                        print(f"  Price: {price}, Size: {size}")
                    print(f"{'='*50}\n")
                    await self.handle_snapshot(data)
                    
                elif data['type'] == 'l2update':
                    print(f"\n{'-'*50}")
                    print(f"L2 Update for {data['product_id']}:")
                    for change in data['changes']:
                        side, price, size = change
                        print(f"  {side.upper()}: Price {price}, Size {size}")
                    print(f"{'-'*50}\n")
                    await self.handle_update(data)
                
        except Exception as e:
            logger.error(f"Error processing Coinbase message: {str(e)}")
            
    async def handle_snapshot(self, data):
        try:
            product_id = data['product_id']
            symbol = product_id.replace('-', '/')
            
            # Convert to our format
            bids = [[float(price), float(size)] for price, size in data['bids']]
            asks = [[float(price), float(size)] for price, size in data['asks']]
            
            entry = OrderBookEntry(
                exchange='coinbase',
                symbol=symbol,
                timestamp=datetime.utcnow(),
                bids=json.dumps(bids),#[:10],  # Store top 10 levels
                asks=json.dumps(asks),#[:10],
                bid_price=float(bids[0][0]) if bids else None,
                ask_price=float(asks[0][0]) if asks else None,
                exchange_location='San Francisco, USA'
            )
            
            self.session.add(entry)
            await self.session.commit()
            
        except Exception as e:
            logger.error(f"Error handling Coinbase snapshot: {str(e)}")
            
    async def handle_update(self, data):
        try:
            product_id = data['product_id']
            symbol = product_id.replace('-', '/')
            
            # Get latest order book entry
            latest = await self.session.query(OrderBookEntry)\
                .filter(
                    OrderBookEntry.symbol == symbol,
                    OrderBookEntry.exchange == 'coinbase'
                )\
                .order_by(OrderBookEntry.timestamp.desc())\
                .first()
                
            if latest:
                bids = json.loads(latest.bids)
                asks = json.loads(latest.asks)
                
                # Update order book
                for change in data['changes']:
                    side, price, size = change
                    price, size = float(price), float(size)
                    
                    if side == 'buy':
                        book_side = bids
                    else:
                        book_side = asks
                        
                    # Update or remove level
                    if float(size) == 0:
                        book_side = [level for level in book_side if level[0] != price]
                    else:
                        # Update existing level or insert new one
                        updated = False
                        for level in book_side:
                            if level[0] == price:
                                level[1] = size
                                updated = True
                                break
                        if not updated:
                            book_side.append([price, size])
                    
                    # Sort and trim
                    if side == 'buy':
                        bids = sorted(book_side, key=lambda x: -x[0])#[:10]
                    else:
                        asks = sorted(book_side, key=lambda x: x[0])#[:10]
                
                # Create new entry
                entry = OrderBookEntry(
                    exchange='coinbase',
                    symbol=symbol,
                    timestamp=datetime.utcnow(),
                    bids=json.dumps(bids),
                    asks=json.dumps(asks),
                    bid_price=float(bids[0][0]) if bids else None,
                    ask_price=float(asks[0][0]) if asks else None,
                    exchange_location='San Francisco, USA'
                )
                
                self.session.add(entry)
                await self.session.commit()
                
        except Exception as e:
            logger.error(f"Error handling Coinbase update: {str(e)}")

    async def close(self):
        if hasattr(self, 'ws'):
            await self.ws.close()

async def main():
    crypto_logger = CryptoLogger()
    await crypto_logger.start_logging()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

def fetch_orderbooks():
    tokens = ['BTC', 'ETH', 'SOL', 'XRP']
    session = Session()
    
    try:
        for exchange_id, exchange_class in exchanges.items():
            exchange = exchange_class()
            
            for token in tokens:
                symbol = f"{token}/USDT"
                try:
                    orderbook = exchange.fetch_order_book(symbol)
                    
                    entry = OrderBookEntry(
                        exchange=exchange_id,
                        symbol=symbol,
                        timestamp=datetime.utcnow(),
                        bids=json.dumps(orderbook['bids']),
                        asks=json.dumps(orderbook['asks']),
                        bid_price=float(orderbook['bids'][0][0]) if orderbook['bids'] else None,
                        ask_price=float(orderbook['asks'][0][0]) if orderbook['asks'] else None
                    )
                    
                    session.add(entry)
                    
                except Exception as e:
                    print(f"Error fetching {symbol} from {exchange_id}: {e}")
                    continue
                
        session.commit()
        
    except Exception as e:
        print(f"Error in fetch_orderbooks: {e}")
        session.rollback()
    finally:
        session.close()