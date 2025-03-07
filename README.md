Globe Crypto

Globe Crypto is a cryptocurrency market visualization tool that logs real-time order book data from multiple exchanges using ccxt and provides an interface to view order book density across different platforms.

Features

Multi-Exchange Support: Uses ccxt to fetch order book data from major crypto exchanges.

Real-Time Data Logging: Continuously updates and stores order book snapshots.

Order Book Visualization: Displays order book density, allowing users to compare liquidity across exchanges.

Customizable Data Storage: Supports logging order book snapshots to CSV or a database.

Installation

Prerequisites

Ensure you have Python installed (>=3.8).

Clone the Repository

Install Dependencies

pip install -r requirements.txt

Usage

1. Running the Order Book Logger

Run the script to start logging order book data:

python backend/logger.py

This will fetch and store order book snapshots at predefined intervals.

2. Viewing Order Book Density

Run the visualization tool to analyze order book depth:

python backend/app.py

This will generate real-time plots comparing liquidity across exchanges.

Supported Exchanges:
- Binance
- Coinbase
- Kraken
- Kucoin
- Huobi
- Bitfinex
- Bybit
- OKX
- Gate
- Mexc
  
Roadmap

Move from CCXT ease of use logging to direct websocket monitoring with all exchanges, already created for direct data pipeline, need to link in.

License

MIT License

Contact

For inquiries, reach out to Henry Wingrove or open an issue on GitHub.

