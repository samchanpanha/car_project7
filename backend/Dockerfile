FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S khlan && adduser -S khlan -G khlan

COPY target/*.jar app.jar

USER khlan:khlan
EXPOSE 8080

ENTRYPOINT ["java", "-XX:+UseZGC", "-XX:+ZGenerational", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
