require('dotenv').config();
const express = require('express');
const authRouter = require('./auth');

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

app.listen(process.env.PORT_GATEWAY, () => {
  console.log(`Gateway berjalan di port ${process.env.PORT_GATEWAY}`);
});