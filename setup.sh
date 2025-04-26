
#!/bin/bash

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install required packages
echo "Installing required packages..."
pip install python-telegram-bot
pip install python-dotenv

# Create database directory if it doesn't exist
if [ ! -d "data" ]; then
    echo "Creating data directory..."
    mkdir -p data
fi

# Create .env file for environment variables if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    echo "TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN" > .env
    echo "DEFAULT_PROMO_CODE=nabi" >> .env
    echo "Please update .env file with your actual bot token."
else
    echo ".env file already exists."
fi

# Initialize the database
echo "Initializing database..."
python -c "from ensaios import init_db; init_db()"

echo "Setup completed successfully!"
echo "To run the bot, use: source venv/bin/activate && python ensaios.py"

# Make the script executable after creation
chmod +x run_ensaios_bot.sh