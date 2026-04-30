require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TRACK_LENGTH = 30;
const CHANNEL_ID = "1499430260003962991";

let balances = {};
let currentGame = null;
let gameMessage = null;
let betLogs = [];

// ===== ODDS =====
function generateOdds() {
  return Array.from({ length: 5 }, () =>
    parseFloat((Math.random() * 2 + 1.5).toFixed(2))
  );
}

// ===== UI =====
function renderRace(progress, finishOrder = [], finished = false, winnerIndex = null) {
  let desc = "```";

  progress.forEach((p, i) => {
    let pos = Math.floor(p / 3);
    let safePos = Math.min(pos, TRACK_LENGTH - 1);

    let track = "";
    for (let j = 0; j < TRACK_LENGTH; j++) {
      track += j === safePos ? "🏇" : "─";
    }

    let rank = finishOrder.indexOf(i);

    let medal = "";
    if (rank === 0) medal = "🥇";
    else if (rank === 1) medal = "🥈";
    else if (rank === 2) medal = "🥉";

    let glow = finished && i === winnerIndex ? "🔥🔥🔥" : "";

    desc += `${glow} Ngựa ${i + 1} ${medal}\n`;
    desc += `${track}|🏁|\n\n`;
  });

  desc += "```";

  return new EmbedBuilder()
    .setTitle(finished ? "🏁 KẾT THÚC CUỘC ĐUA" : "🏇 CUỘC ĐUA ĐANG DIỄN RA")
    .setDescription(desc)
    .setColor(finished ? 0x00ff99 : 0xffcc00);
}

// ===== LOBBY =====
async function showLobby(channel) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("start_race")
      .setLabel("Bắt đầu vòng mới")
      .setEmoji("🎮")
      .setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🏇 ĐUA NGỰA")
    .setDescription(
      "```fix\nNhấn nút để bắt đầu\nMọi người có thể đặt cược\n```\n✨ Sẵn sàng chơi\n\n⏳ Chờ người chơi bắt đầu..."
    );

  if (!gameMessage) {
    gameMessage = await channel.send({
      embeds: [embed],
      components: [row]
    });
  } else {
    await gameMessage.edit({
      embeds: [embed],
      components: [row]
    });
  }
}

// ===== START GAME =====
async function startNewRace(channel) {
  const odds = generateOdds();

  currentGame = {
    horses: odds.map((o, i) => ({ id: i + 1, odds: o })),
    bets: {}
  };

  betLogs = [];

  const row = new ActionRowBuilder();
  for (let i = 1; i <= 5; i++) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("horse_" + i)
        .setLabel("Ngựa " + i)
        .setStyle(ButtonStyle.Primary)
    );
  }

  let endTime = Date.now() + 30000;

  let countdown = setInterval(async () => {
    let timeLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));

    let totals = [0, 0, 0, 0, 0];
    for (let uid in currentGame.bets) {
      let b = currentGame.bets[uid];
      totals[b.horse - 1] += b.amount;
    }

    let desc = "```fix\n";
    currentGame.horses.forEach((h, i) => {
      desc += `Ngựa ${h.id} • x${h.odds} • ${totals[i]}$\n`;
    });
    desc += "```";

    if (betLogs.length > 0) {
      desc += "\n📢 Cược gần đây:\n" + betLogs.join("\n");
    }

    await gameMessage.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏇 ĐUA NGỰA")
          .setDescription(desc + `\n⏳ Còn ${timeLeft}s`)
          .setColor(0x0099ff)
      ],
      components: [row]
    });

    if (timeLeft <= 0) {
      clearInterval(countdown);
      await gameMessage.edit({ components: [] });
      startRace(channel);
    }

  }, 1000);
}

// ===== RACE =====
async function startRace(channel) {
  betLogs = [];

  let progress = [0, 0, 0, 0, 0];
  let velocity = [0, 0, 0, 0, 0];
  let finishOrder = [];
  let finished = false;

  let interval = setInterval(async () => {

    let max = Math.max(...progress);

    for (let i = 0; i < 5; i++) {

      // 🎯 gia tốc mượt hơn (có randomness nhỏ)
      let accel = 0.3 + Math.random() * 0.5;

      // 🎥 slow motion gần đích (mượt, không giật)
      if (max > TRACK_LENGTH * 2.3) {
        accel *= 0.25;
      }

      velocity[i] += accel;

      // 🎯 damping để không bị giật
      velocity[i] *= 0.92;

      // 🎯 giới hạn tốc độ
      velocity[i] = Math.min(velocity[i], 2.2);

      progress[i] += velocity[i];

      // 🎯 ghi nhận về đích ngay
      if (progress[i] >= TRACK_LENGTH * 3 && !finishOrder.includes(i)) {
        finishOrder.push(i);
      }
    }

    await gameMessage.edit({
      embeds: [renderRace(progress, finishOrder)]
    });

    // 💥 CHỈ CẦN CÓ NGƯỜI THẮNG LÀ KẾT THÚC NGAY
    if (!finished && finishOrder.length >= 1) {
      finished = true;
      clearInterval(interval);

      let winner = finishOrder[0];

      let result = `🏆 Ngựa ${winner + 1} chiến thắng!\n\n`;

      for (let userId in currentGame.bets) {
        let bet = currentGame.bets[userId];
        let name = client.users.cache.get(userId)?.username || "User";

        if (bet.horse === winner + 1) {
          let odds = currentGame.horses[winner].odds;
          let win = bet.amount * odds;
          balances[userId] += win;
          result += `🟢 ${name} +${win}\n`;
        } else {
          result += `🔴 ${name} -${bet.amount}\n`;
        }
      }

      // 💥 render ngay lập tức (không delay)
      await gameMessage.edit({
        embeds: [
          renderRace(progress, finishOrder, true, winner),
          new EmbedBuilder()
            .setTitle("📊 KẾT QUẢ")
            .setDescription(result + "\n⏳ Sẵn sàng vòng mới")
            .setColor(0x00ff99)
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("start_race")
              .setLabel("Bắt đầu vòng mới")
              .setEmoji("🎮")
              .setStyle(ButtonStyle.Primary)
          )
        ]
      });

      currentGame = null;
    }

  }, 100); // 🔥 mượt hơn 120ms
}
// ===== READY =====
client.once("clientReady", async () => {
  console.log("🚀 BOT READY");
  const channel = await client.channels.fetch(CHANNEL_ID);
  showLobby(channel);
});

// ===== INTERACTION =====
client.on("interactionCreate", async (interaction) => {

  if (interaction.isButton()) {

    if (interaction.customId === "start_race") {
      if (currentGame) return interaction.deferUpdate();
      await interaction.deferUpdate();
      startNewRace(interaction.channel);
      return;
    }

    if (!currentGame) return;

    const horse = parseInt(interaction.customId.split("_")[1]);

    const modal = new ModalBuilder()
      .setCustomId("bet_" + horse)
      .setTitle("💰 Nhập tiền cược");

    const input = new TextInputBuilder()
      .setCustomId("money")
      .setLabel("Số tiền")
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit()) {
    const horse = parseInt(interaction.customId.split("_")[1]);
    const amount = parseInt(interaction.fields.getTextInputValue("money"));

    if (!balances[interaction.user.id]) balances[interaction.user.id] = 10000;

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: "❌ Sai số", ephemeral: true });
    }

    if (balances[interaction.user.id] < amount) {
      return interaction.reply({ content: "❌ Không đủ tiền", ephemeral: true });
    }

    balances[interaction.user.id] -= amount;

    currentGame.bets[interaction.user.id] = {
      horse,
      amount
    };

    betLogs.push(`💰 ${interaction.user.username} → ngựa ${horse} (${amount})`);
    if (betLogs.length > 5) betLogs.shift();

    await interaction.deferUpdate();
  }

});

client.login(process.env.TOKEN);