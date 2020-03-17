FROM node:13

COPY ./entrypoint.sh /entrypoint.sh
RUN chmod u+x /entrypoint.sh

WORKDIR /code/oada-ensure

CMD '/entrypoint.sh'
