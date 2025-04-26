import logging
import os
import sqlite3
from datetime import datetime

from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ConversationHandler,
    CallbackQueryHandler,
    ContextTypes,
)

# Load environment variables
load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
DEFAULT_PROMO_CODE = os.getenv("DEFAULT_PROMO_CODE", "nabi")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set in environment")

# Enable logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# Define conversation states
PHONE, LASTNAME, GENDER, BIRTHDATE, EDUCATION, PROMO_QUESTION, PROMO_CODE = range(7)

def init_db():
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        """
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
        """
    )
    conn.commit()
    conn.close()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "Здравствуйте! Я — бот ensaios.\n\n"
        "Нам нужно зарегистрироваться. Минимум вопросов, всё пройдёт максимально быстро.\n\n"
        "Регистрация доступна только для совершеннолетних. Дальнейшее использование сервиса подтверждает вашу согласие на обработку персональных данных и акцепт публичной оферты.\n\n"
        "Пожалуйста, введите ваш номер телефона для начала регистрации."
    )
    return PHONE

async def phone(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["phone"] = update.message.text
    await update.message.reply_text("Спасибо! Теперь, пожалуйста, введите вашу фамилию.")
    return LASTNAME

async def lastname(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["lastname"] = update.message.text
    keyboard = [
        [
            InlineKeyboardButton("Мужской", callback_data="Мужской"),
            InlineKeyboardButton("Женский", callback_data="Женский"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Пожалуйста, выберите ваш пол:", reply_markup=reply_markup)
    return GENDER

async def gender(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data["gender"] = query.data
    await query.edit_message_text(
        f"Вы выбрали: {query.data}\n\nТеперь, пожалуйста, введите вашу дату рождения в формате ДД.ММ.ГГГГ"
    )
    return BIRTHDATE

async def birthdate(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    try:
        datetime.strptime(text, "%d.%m.%Y")
    except ValueError:
        await update.message.reply_text(
            "Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например, 01.01.1990)"
        )
        return BIRTHDATE
    context.user_data["birthdate"] = text
    keyboard = [
        [InlineKeyboardButton("Среднее", callback_data="Среднее")],
        [InlineKeyboardButton("Среднее профессиональное", callback_data="Среднее профессиональное")],
        [InlineKeyboardButton("Неоконченное высшее", callback_data="Неоконченное высшее")],
        [InlineKeyboardButton("Высшее", callback_data="Высшее")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Выберите ваш уровень образования:", reply_markup=reply_markup)
    return EDUCATION

async def education(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data["education"] = query.data
    keyboard = [
        [InlineKeyboardButton("Да", callback_data="yes"), InlineKeyboardButton("Нет", callback_data="no")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await query.edit_message_text(
        f"Уровень образования: {query.data}\n\nУ вас есть промокод?", reply_markup=reply_markup
    )
    return PROMO_QUESTION

async def promo_question(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    if query.data == "yes":
        await query.edit_message_text("Пожалуйста, введите ваш промокод:")
        return PROMO_CODE
    else:
        save_user_data(
            query.from_user.id,
            context.user_data.get("phone", ""),
            context.user_data.get("lastname", ""),
            context.user_data.get("gender", ""),
            context.user_data.get("birthdate", ""),
            context.user_data.get("education", ""),
            None,
        )
        await query.edit_message_text(
            "Спасибо за регистрацию! Скоро мы пришлем вам первый тест и все объясним."
        )
        return ConversationHandler.END

async def promo_code(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text
    context.user_data["promo_code"] = text
    save_user_data(
        update.message.from_user.id,
        context.user_data.get("phone", ""),
        context.user_data.get("lastname", ""),
        context.user_data.get("gender", ""),
        context.user_data.get("birthdate", ""),
        context.user_data.get("education", ""),
        text,
    )
    if text.lower() == DEFAULT_PROMO_CODE.lower():
        await update.message.reply_text(
            "Промокод принят! Вы получили бесплатный доступ к тестированию. Скоро мы пришлем вам первый тест и все объясним."
        )
    else:
        await update.message.reply_text(
            "Спасибо за регистрацию! Скоро мы пришлем вам первый тест и все объясним."
        )
    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text(
        "Регистрация отменена. Для новой регистрации введите /start"
    )
    return ConversationHandler.END

def save_user_data(user_id, phone, lastname, gender, birthdate, education, promo_code):
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT OR REPLACE INTO users
        (user_id, phone_number, lastname, gender, birthdate, education, promo_code, registration_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            phone,
            lastname,
            gender,
            birthdate,
            education,
            promo_code,
            datetime.now(),
        ),
    )
    conn.commit()
    conn.close()

def main():
    init_db()
    application = Application.builder().token(BOT_TOKEN).build()
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, phone)],
            LASTNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, lastname)],
            GENDER: [CallbackQueryHandler(gender)],
            BIRTHDATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, birthdate)],
            EDUCATION: [CallbackQueryHandler(education)],
            PROMO_QUESTION: [CallbackQueryHandler(promo_question)],
            PROMO_CODE: [MessageHandler(filters.TEXT & ~filters.COMMAND, promo_code)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )
    application.add_handler(conv_handler)
    application.run_polling()

if __name__ == "__main__":
    main()