FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app

# Resolve dependencies first for better layer caching
COPY pom.xml .
RUN mvn -q dependency:go-offline -DskipTests

# Copy application source
COPY src ./src

# Build executable fat jar
RUN mvn -q clean package -DskipTests

# ------------------------------------------------------------
# Runtime
# ------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN apk add --no-cache curl tesseract-ocr tesseract-ocr-data-eng && \
    addgroup -S khlan && adduser -S khlan -G khlan && \
    mkdir -p /app/uploads && chown -R khlan:khlan /app

COPY --from=builder --chown=khlan:khlan /app/target/*.jar /app/app.jar

ENV TESSDATA_PREFIX=/usr/share/tessdata
USER khlan:khlan
EXPOSE 8080

ENTRYPOINT ["java", "-XX:+UseZGC", "-XX:+ZGenerational", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/app/app.jar"]