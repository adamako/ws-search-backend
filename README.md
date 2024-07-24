# ws-search-backend

## Prérequis

Avant de commencer, assurez-vous d'avoir les éléments suivants installés sur votre machine locale :

- [Node.js](https://nodejs.org/): version la plus récente ou >= 16

## Démarrer

1. Clonez ce dépôt sur votre machine locale

   ```bash
   # avec ssh
   git clone git@github.com:adamako/ws-search-backend.git
   
   # avec https
   git clone https://github.com/adamako/ws-search-backend.git

2. Accédez au répertoire du projet
   ```bash
   cd ws-search-backend

3. Installez les dépendances du projet
   ```bash
   npm install
4. Configurez la variable d'environnement
   ```bash
   cp .env.example .env
5. Démarrez le serveur de développement
   ```bash
   npm run dev

L'application devrait maintenant être accessible à l'adresse http://localhost:3000
