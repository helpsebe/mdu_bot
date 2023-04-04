const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");

require("dotenv").config();

// process.env.NTBA_FIX_319 = "test";

const token = process.env.TOKEN_BOT;
const bot = new TelegramBot(token, { polling: true });

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
let db;

async function connectToDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    db = client.db("menuBotDB");
  } catch (err) {
    console.error(err);
  }
}

function disconnectFromDB() {
  client.close();
  console.log("Disconnected from MongoDB");
}

async function getMenu() {
  const menuCollection = db.collection("menu");
  const menu = await menuCollection.find().toArray();
  return menu;
}

async function addMenuItem(item) {
  const menuCollection = db.collection("menu");
  const result = await menuCollection.insertOne(item);
  console.log(`Item added with ID: ${result.insertedId}`);
}

async function editMenuItem(item) {
  const menuCollection = db.collection("menu");
  const result = await menuCollection.updateOne(
    { _id: item._id },
    { $set: { text: item.text, response: item.response, counter: item.counter } }
  );
  console.log(`Item updated with ID: ${item._id}`);
}

async function deleteMenuItem(id) {
  const menuCollection = db.collection("menu");
  const result = await menuCollection.deleteOne({ _id: id });
  console.log(`Item deleted with ID: ${id}`);
}

async function getUser(id) {
  const usersCollection = db.collection("users");
  const user = await usersCollection.findOne({ id: id });
  return user;
}

async function addUser(user) {
  const usersCollection = db.collection("users");
  const result = await usersCollection.insertOne(user);
  console.log(`User added with ID: ${result.insertedId}`);
}

async function updateUser(id, counter) {
  const usersCollection = db.collection("users");
  const result = await usersCollection.updateOne(
    { id: id },
    { $set: { counter: counter } }
  );
  console.log(`User updated with ID: ${id}`);
}

async function initDB() {
  try {
    await connectToDB();
    // await db.createCollection("menu");
    // await db.createCollection("users");
    console.log("DB initialized");
  } catch (err) {
    console.error(err);
  }
}

async function handleStart(msg) {
  const chatId = msg.chat.id;
  const menu = await getMenu();
  console.log("newUser:", msg.from.username, msg.text);
  const keyboard = {
    reply_markup: {
      keyboard: menu.map((item) => [{ text: item.text }]),
    },
  };

  bot
    .sendPhoto(chatId, "./banner.jpg", {
      caption: `👋🏻 Вас вітає бот Навчального порталу МДУ - Moodlik! \n\n📲 Цей бот призначено для допомоги користувачам Навчального порталу. \n\n 🔎 Користуючись кнопками меню, Ви зможете знайти інформацію, яка Вас цікавить!`,
    })
    .then(() => {
      bot.sendMessage(chatId, "🌐 Меню:", keyboard);
    });
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const selectedButton = msg.text;
  const user = await getUser(chatId);

  console.log("handlingMessage:", msg.from.username, msg.text);

  if (user) {
    await updateUser(chatId, user.counter + 1);
  } else {
    await addUser({ id: chatId, counter: 1 });
  }

  const menu = await getMenu();
  const button = menu.find((item) => item.text === selectedButton);

  if (button === undefined && !selectedButton.startsWith("/")) {
    const keyboard = {
      reply_markup: {
        keyboard: menu.map((item) => [{ text: item.text }]),
      },
    };
    bot.sendMessage(chatId, "🚧 Помилка: \n\n🛸 відповіді не існує", keyboard);
    return;
  }

  const keyboard = {
    reply_markup: {
      keyboard: menu.map((item) => [{ text: item.text }]),
    },
  };

  if (button && button.response) {
    bot.sendMessage(chatId, button.response, keyboard);
    await editMenuItem({
      _id: button._id,
      text: button.text,
      response: button.response,
      counter: button.counter + 1,
    });
  } else if (button && !button.response) {
    bot.sendMessage(chatId, "🚧 Помилка: \n\n🛸 відповіді не існує", keyboard);
  }
}

async function handleAddButton(msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = await getUser(userId);

  if (!user || !user.isAdmin) {
    bot.sendMessage(chatId, "🚫 У вас немає прав для цієї команди.");
    return;
  }

  const text = match[1];
  const [buttonName = "", buttonText = ""] = text
    .match(/"([^"]+)"\s+"([^"]+)"/)
    .slice(1);

  await addMenuItem({ text: buttonName, response: buttonText, counter: 0 });
  bot.sendMessage(chatId, `✅ Кнопка "${buttonName}" була додана в меню!`);
  bot.sendMessage(chatId, `Для оновлення меню пропищіть /start`);
}

async function handleEditButton(msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = await getUser(userId);

  if (!user || !user.isAdmin) {
    bot.sendMessage(chatId, "🚫 У вас немає прав для цієї команди.");
    return;
  }

  const buttonIndex = Number(match[1]) - 1;
  const buttonText = match[2];
  const buttonResponse = match[3];

  if (!buttonIndex && !buttonText && !buttonResponse) {
    bot.sendMessage(chatId, "Помилка: невірний формат");
    return;
  }

  const menu = await getMenu();
  const editableButton = menu[buttonIndex];

  if (!editableButton) {
    bot.sendMessage(chatId, `⚠️ Помилка: об'єкт не існує`);
    return;
  }

  await editMenuItem({
    _id: editableButton._id,
    text: buttonText,
    response: buttonResponse,
    counter: editableButton.counter,
  });
  bot.sendMessage(
    chatId,
    `✅ Нова назва "${buttonText}" та опис "${buttonResponse}"!`
  );
  bot.sendMessage(chatId, `Для оновлення меню пропищіть /start`);
}

async function handleDeleteButton(msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = await getUser(userId);

  if (!user || !user.isAdmin) {
    bot.sendMessage(chatId, "🚫 У вас немає прав для цієї команди.");
    return;
  }

  const query = match[1];
  const buttonIndex = Number(query) - 1;

  if (isNaN(buttonIndex)) {
    bot.sendMessage(chatId, `⚠️ Помилка: аргумент має бути числом.`);
    return;
  }

  const menu = await getMenu();
  const deleteableButton = menu[buttonIndex];

  if (!deleteableButton) {
    bot.sendMessage(chatId, `⚠️ Помилка: об'єкт не існує`);
    return;
  }

  await deleteMenuItem(deleteableButton._id);
  bot.sendMessage(chatId, `✅ Кнопка "${nameButton}" видалена з меню!`);
  bot.sendMessage(chatId, `Для оновлення меню пропищіть /start`);
}

async function getStatsInfo(msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = await getUser(userId);

  if (!user || !user.isAdmin) {
    bot.sendMessage(chatId, "🚫 У вас немає прав для цієї команди.");
    return;
  }

  const stats = await db.collection("users").find().toArray();
  const menuStats = await db
    .collection("menu")
    .find()
    .sort({ counter: -1 })
    .toArray();

  const total = stats.length;
  const totalMenu = menuStats.map(
    (button) => `   ${button.counter}      | ${button.text}\n`
  );
  const stringInfoMenu = totalMenu.join("\n");
  const counter = stats.reduce((acc, curr) => acc + curr.counter, 0);

  bot.sendMessage(
    chatId,
    `👥 Усього користувачів: ${total}\n📊 Спільна кількість кліків на кнопки меню: ${counter} \n\n📈 Статистика кліків в меню: \n--------------------------------------\nКліків | Кнопка\n--------------------------------------\n${stringInfoMenu}`
  );
}

async function getAdminInfo(msg, match) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const user = await getUser(userId);

  if (!user || !user.isAdmin) {
    bot.sendMessage(chatId, "🚫 У вас немає прав для цієї команди.");
    return;
  }
  bot.sendMessage(
    chatId,
    'додавання нової кнопки в меню:\n`/add_button "назва кнопки" "текст відповіді"`\n\nредагування існуючої кнопки:\n`/edit_button *номер редагованої кнопки* "нова назва кнопки" "новий текст відповіді"`\n\nвидалення кнопки з меню:\n`/delete_button *номер кнопки*`\n\n🔰 Додаткові команди:\n/stats - статистика',
    // "*bold* _italic_ `fixed width font` [link](http://google.com).",
    { parse_mode: "Markdown" }
  );
  bot.sendMessage(
    chatId,
    'приклади:\n\n`/add_button "Розклад" "посилання на розклад"`\n\n`/edit_button 3 "Нова назва" "Новий текст відповіді"`\n\n`/delete_button 2`',
    // "*bold* _italic_ `fixed width font` [link](http://google.com).",
    { parse_mode: "Markdown" }
  );
}

async function main() {
  await initDB();

  bot.onText(/\/start/, handleStart);
  bot.on("message", handleMessage);
  bot.onText(/\/add_button (.+)/, handleAddButton);
  bot.onText(/\/edit_button (\d+) "([^"]+)" "([^"]+)"/, handleEditButton);
  bot.onText(/\/delete_button (.+)/, handleDeleteButton);

  bot.onText(/\/stats/, getStatsInfo);
  bot.onText(/\/admin/, getAdminInfo);

  process.on("SIGINT", () => {
    disconnectFromDB();
    process.exit();
  });
}

main();
