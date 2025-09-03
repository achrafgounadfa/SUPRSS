FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
# We copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Expose API port
EXPOSE 5000

# Start the development server by default
CMD ["npm", "run", "dev"]