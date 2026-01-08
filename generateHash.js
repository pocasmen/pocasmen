const bcrypt = require('bcryptjs');
    
         const password = '123'; // A password que quer fazer hash
         const saltRounds = 10; // O número de rounds de salt (quanto maior, mais seguro, mas mais lento)
    
         bcrypt.hash(password, saltRounds, (err, hash) => {
           if (err) {
             console.error('Erro ao gerar hash:', err);
             return;
          }
          console.log('Hash para "123":', hash);
        });