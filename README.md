# Globe Crypto

**Globe Crypto** is a cryptocurrency market visualization tool that logs real-time order book data from multiple exchanges using `ccxt` and provides an interface to view order book density across different platforms.

---

## Features

- **Multi-Exchange Support**: Uses `ccxt` to fetch order book data from major crypto exchanges.
- **Real-Time Data Logging**: Continuously updates and stores order book snapshots.
- **Order Book Visualization**: Displays order book density, allowing users to compare liquidity across exchanges.
- **Customizable Data Storage**: Supports logging order book snapshots to CSV or a database.

---

## Installation

### Prerequisites
Ensure you have Python installed (>=3.8).

### Clone the Repository
```sh
git clone https://github.com/your-username/globe-crypto.git
cd globe-crypto
```

### Install Dependencies
```sh
pip install -r requirements.txt
```

---

## Usage

### Running the Order Book Logger
Run the script to start logging order book data:
```sh
python backend/logger.py
```
This will fetch and store order book snapshots at predefined intervals.

### Viewing Order Book Density
Run the visualization tool to analyze order book depth:
```sh
python backend/app.py
```
This will generate real-time plots comparing liquidity across exchanges.

---

## Supported Exchanges

- Binance
- Coinbase
- Kraken
- KuCoin
- Huobi
- Bitfinex
- Bybit
- OKX
- Gate
- MEXC

---

## Roadmap

- Move from `ccxt` logging to **direct WebSocket monitoring** for all exchanges.
- Direct data pipeline already created; needs integration.

---

## License

This project is licensed under the **MIT License**.

---


