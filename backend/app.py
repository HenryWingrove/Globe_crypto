from flask import Flask, render_template, jsonify, send_file
import geopandas as gpd
import os
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from flask_socketio import SocketIO
from datetime import datetime
from logger import Base, OrderBookEntry

app = Flask(__name__, 
    template_folder='../frontend/templates',
    static_folder='../frontend/static'
)
socketio = SocketIO(app, cors_allowed_origins="*")

# Database connection
engine = sa.create_engine('sqlite:///crypto_orderbook.db')
Session = sessionmaker(bind=engine)

# Paths for Shapefile and GeoJSON
SHAPEFILE_PATH = "/Users/henrywingrove/Documents/Projects_/Globe_crypto/backend/shapefile_data/ne_110m_land.shp"
GEOJSON_PATH = os.path.join(app.static_folder, "data/continents.geojson")

# Function to convert the shapefile to GeoJSON
def convert_shapefile_to_geojson():
    if not os.path.exists(GEOJSON_PATH):
        print("Converting Shapefile to GeoJSON...")
        
        # Load shapefile
        gdf = gpd.read_file(SHAPEFILE_PATH)
        
        # Convert to GeoJSON
        os.makedirs(os.path.dirname(GEOJSON_PATH), exist_ok=True)
        gdf.to_file(GEOJSON_PATH, driver="GeoJSON")
        
        print(f"GeoJSON saved to {GEOJSON_PATH}")

# Ensure GeoJSON is available on startup
convert_shapefile_to_geojson()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/continents')
def get_continents():
    """Serve the converted GeoJSON for continent outlines"""
    if os.path.exists(GEOJSON_PATH):
        return send_file(GEOJSON_PATH, mimetype='application/json')
    return jsonify({'error': 'GeoJSON not found'}), 404

@app.route('/api/orderbook/<symbol>')
def get_orderbook(symbol):
    session = Session()
    try:
        entries = session.query(OrderBookEntry)\
            .filter(OrderBookEntry.symbol == symbol.upper())\
            .order_by(OrderBookEntry.timestamp.desc())\
            .all()
        
        exchange_data = {}
        for entry in entries:
            if entry.exchange not in exchange_data:
                exchange_data[entry.exchange] = {
                    'bid_price': entry.bid_price,
                    'ask_price': entry.ask_price,
                    'timestamp': entry.timestamp.isoformat()
                }
        
        return jsonify(exchange_data)
        
    finally:
        session.close()

@app.route('/api/orderbook/<symbol>/<quote>/<exchange>')
def get_exchange_orderbook(symbol, quote, exchange):
    session = Session()
    try:
        symbol_pair = f"{symbol}/{quote}"
        entry = session.query(OrderBookEntry)\
            .filter(
                OrderBookEntry.symbol == symbol_pair,
                OrderBookEntry.exchange == exchange
            )\
            .order_by(OrderBookEntry.timestamp.desc())\
            .first()
        
        if entry:
            return jsonify({
                'bids': entry.bids,
                'asks': entry.asks,
                'timestamp': entry.timestamp.isoformat(),
                'symbol': entry.symbol,
                'exchange': entry.exchange
            })
            
        return jsonify({
            'error': f'No data found for {symbol_pair} on {exchange}',
            'symbol': symbol_pair,
            'exchange': exchange
        }), 404
        
    except Exception as e:
        print(f"Error fetching orderbook: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        session.close()

@app.route('/api/debug/latest')
def debug_latest_entries():
    """Debug endpoint to see latest entries for each exchange"""
    session = Session()
    try:
        entries = session.query(OrderBookEntry)\
            .order_by(OrderBookEntry.timestamp.desc())\
            .all()
            #.limit(10)\
        
        return jsonify([{
            'exchange': entry.exchange,
            'symbol': entry.symbol,
            'timestamp': entry.timestamp.isoformat(),
            'bids_sample': entry.bids[:100] if entry.bids else None,
            'asks_sample': entry.asks[:100] if entry.asks else None
        } for entry in entries])
    finally:
        session.close()

def background_task():
    """Emit orderbook updates to connected clients"""
    tokens = ['BTC', 'ETH', 'SOL', 'XRP']
    
    while True:
        session = Session()
        try:
            exchange_data = {}
            
            # Query all tokens
            for token in tokens:
                symbol_pair = f"{token}/USDT"
                entries = session.query(OrderBookEntry)\
                    .filter(OrderBookEntry.symbol == symbol_pair)\
                    .order_by(OrderBookEntry.timestamp.desc())\
                    .all()
                
                # Group by exchange
                for entry in entries:
                    if entry.exchange not in exchange_data:
                        exchange_data[entry.exchange] = {}
                    
                    # Only take the first (most recent) entry for each exchange/token
                    if token not in exchange_data[entry.exchange]:
                        exchange_data[entry.exchange][token] = {
                            'bid_price': entry.bid_price,
                            'ask_price': entry.ask_price,
                            'timestamp': entry.timestamp.isoformat()
                        }
            
            socketio.emit('orderbook_update', exchange_data)
            
        except Exception as e:
            print(f"Error in background task: {e}")
        finally:
            session.close()
        socketio.sleep(5)

@socketio.on('connect')
def handle_connect():
    print("Client connected")
    socketio.start_background_task(background_task)

if __name__ == '__main__':
    socketio.run(app, debug=True)