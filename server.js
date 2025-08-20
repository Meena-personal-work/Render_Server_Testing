const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const crackerRoutes = require('./routes/crackerRoutes');
const ordersRouter = require('./routes/ordersRoutes');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

app.use('/api/crackers', crackerRoutes);
app.use('/api/orders', ordersRouter);

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));
