FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Copy built files to the volume mount point and keep container running
CMD ["sh", "-c", "cp -r /app/dist/* /app/dist-volume/ 2>/dev/null || true && tail -f /dev/null"]
