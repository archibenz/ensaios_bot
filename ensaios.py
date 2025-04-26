import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ConversationHandler, CallbackQueryHandler, ContextTypes
import sqlite3
from datetime import datetime
import os
from dotenv import load_dotenv

# Enable logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Define conversation states
PHONE, LASTNAME, GENDER, BIRTHDATE, EDUCATION, PROMO_QUESTION, PROMO_CODE = range(7)

# Database initialization
def init_db():
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        phone_number TEXT,
        lastname TEXT,
        gender TEXT,
        birthdate TEXT,
        education TEXT,
        promo_code TEXT,
        registration_date TIMESTAMP
    )
    ''')
    conn.commit()
    conn.close()

# Start the conversation
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "Здравствуйте! Я — бот ensaios.\n\n"
        "Нам нужно зарегистрироваться. Минимум вопросов, всё пройдёт максимально быстро.\n\n"
        "Регистрация доступна только для совершеннолетних. Дальнейшее использование сервиса подтверждает ваше согласие на обработку персональных данных и акцепт публичной оферты.\n\n"
        "Пожалуйста, введите ваш номер телефона для начала регистрации."
    )
    return PHONE

# Handle phone number
async def phone(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['phone'] = update.message.text
    await update.message.reply_text("Спасибо! Теперь, пожалуйста, введите вашу фамилию.")
    return LASTNAME

# Handle last name
async def lastname(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data['lastname'] = update.message.text
    
    keyboard = [
        [
            InlineKeyboardButton("Мужской", callback_data="Мужской"),
            InlineKeyboardButton("Женский", callback_data="Женский"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text("Пожалуйста, выберите ваш пол:", reply_markup=reply_markup)
    return GENDER

# Handle gender selection
async def gender(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    
    context.user_data['gender'] = query.data
    
    await query.edit_message_text(
        f"Вы выбрали: {query.data}\n\nТеперь, пожалуйста, введите вашу дату рождения в формате ДД.ММ.ГГГГ"
    )
    return BIRTHDATE

# Handle birthdate
async def birthdate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    
    # Validate date format
    try:
        datetime.strptime(text, "%d.%m.%Y")
        valid_format = True
    except ValueError:
        valid_format = False
    
    if not valid_format:
        await update.message.reply_text("Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например, 01.01.1990)")
        return BIRTHDATE
    
    context.user_data['birthdate'] = text
    
    keyboard = [
        [InlineKeyboardButton("Среднее", callback_data="Среднее")],
        [InlineKeyboardButton("Среднее профессиональное", callback_data="Среднее профессиональное")],
        [InlineKeyboardButton("Неоконченное высшее", callback_data="Неоконченное высшее")],
        [InlineKeyboardButton("Высшее", callback_data="Высшее")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text("Выберите ваш уровень образования:", reply_markup=reply_markup)
    return EDUCATION

# Handle education selection
async def education(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    
    context.user_data['education'] = query.data
    
    keyboard = [
        [
            InlineKeyboardButton("Да", callback_data="yes"),
            InlineKeyboardButton("Нет", callback_data="no"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(f"Уровень образования: {query.data}\n\nУ вас есть промокод?", reply_markup=reply_markup)
    return PROMO_QUESTION

# Handle promo code question
async def promo_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    
    if query.data == "yes":
        await query.edit_message_text("Пожалуйста, введите ваш промокод:")
        return PROMO_CODE
    else:
        # Save user data
        save_user_data(
            query.from_user.id,
            context.user_data.get('phone', ''),
            context.user_data.get('lastname', ''),
            context.user_data.get('gender', ''),
            context.user_data.get('birthdate', ''),
            context.user_data.get('education', ''),
            None
        )
        
        await query.edit_message_text("Спасибо за регистрацию! Скоро мы пришлем вам первый тест и все объясним.")
        return ConversationHandler.END

# Handle promo code
async def promo_code(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    context.user_data['promo_code'] = text
    
    # Save user data
    save_user_data(
        update.message.from_user.id,
        context.user_data.get('phone', ''),
        context.user_data.get('lastname', ''),
        context.user_data.get('gender', ''),
        context.user_data.get('birthdate', ''),
        context.user_data.get('education', ''),
        text
    )
    
    if text.lower() == PROMO_CODE_ENV.lower():
        await update.message.reply_text(
            "Промокод принят! Вы получили бесплатный доступ к тестированию. Скоро мы пришлем вам первый тест и все объясним."
        )
    else:
        await update.message.reply_text(
            "Спасибо за регистрацию! Скоро мы пришлем вам первый тест и все объясним."
        )
    
    return ConversationHandler.END

# Save user data to database
def save_user_data(user_id, phone, lastname, gender, birthdate, education, promo_code):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT OR REPLACE INTO users
    (user_id, phone_number, lastname, gender, birthdate, education, promo_code, registration_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, phone, lastname, gender, birthdate, education, promo_code, datetime.now()))
    
    conn.commit()
    conn.close()

# Cancel the conversation
async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Регистрация отменена. Для новой регистрации введите /start")
    return ConversationHandler.END

def main():
    # Initialize database
    init_db()
    
    # Load environment variables
    load_dotenv()
    PROMO_CODE_ENV = os.getenv("DEFAULT_PROMO_CODE", "nabi")
    
    # Create application
    application = Application.builder().token(os.getenv