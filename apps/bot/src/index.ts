import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.BOT_TOKEN;
const miniAppUrl = process.env.MINIAPP_URL;

if (!token) throw new Error('BOT_TOKEN missing');
if (!miniAppUrl) throw new Error('MINIAPP_URL missing');

const bot = new Telegraf(token);

bot.start((ctx) => {
  return ctx.reply('Welcome to TON Resume! Open the mini app to continue.', {
    reply_markup: {
      keyboard: [
        [
          {
            text: 'Open TON Resume',
            web_app: { url: miniAppUrl },
          },
        ],
      ],
      resize_keyboard: true,
    },
  });
});

bot.on('message', (ctx, next) => {
  // Web app data handler
  if ('web_app_data' in ctx.message && (ctx.message as any).web_app_data) {
    ctx.telegram.sendMessage(
      ctx.chat.id,
      `Received web app data: ${(ctx.message as any).web_app_data.data}`
    );
  }
  return next();
});

bot.launch().then(() => console.log('Bot started'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
