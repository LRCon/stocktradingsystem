const express = require('express');

// express app
const app = express();

// register view engine
app.set('view engine', 'ejs');

// listen for requests
app.listen(3000);

// middleware & static files
app.use(express.static('public'));


app.get('/', (req, res) => {

    res.render('index');
    // res.sendFile('./views/index.html', { root: __dirname });

});

app.get('/cash', (req, res) => {
    
    res.render('cash');

});

app.get('/admin-stocks', (req, res) => {
    
    res.render('admin-stocks');

});

app.get('/login', (req, res) => {
    
    res.render('admin');

});

app.get('/mfa', (req, res) => {
    
    res.render('mfa');

});

app.get('/orders', (req, res) => {
    
    res.render('orders');

});

app.get('/trade', (req, res) => {
    
    res.render('trade');

});


app.get('/transactions', (req, res) => {
    
    res.render('transactions');

});



