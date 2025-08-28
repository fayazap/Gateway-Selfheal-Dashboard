# Use Node.js base image
FROM node:18-alpine
 
# Set working directory
WORKDIR /app
 
# Copy package definition and lock file
COPY package.json package-lock.json* ./
 
# Install dependencies
RUN npm install
 
# Copy the rest of the backend code (excluding node_modules due to .dockerignore)
COPY . .
 
# Expose port
EXPOSE 5000
 
CMD ["node", "index.js"]