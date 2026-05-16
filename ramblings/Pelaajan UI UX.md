---
creation date: '[[2025-06-16]]'
---
Pelaajan pitää pystyä luomaan IF THEN ELSEIF ELSE tyyppistä logiikkaa. Osan näistä logiikoista voi "paketoida", jotta pelaajat jotka eivät halua "koodata" vuokaavioilla, voivat yksinkertaisesti vaan ottaa jotain arvoja kuten "Rauhanomainen" yms.

Pelaajan pitää pystyä manipuloimaan hahmojen ryhmä hierarkiaa.

Pelaajan pitää pystyä lähettämään mitä tahansa eventtejä ryhmille tai hahmoille. Valinta voi olla mielivaltainen, esim. valita randomilla 7 hahmoa ja lähettää heille event.

Pelaajalle pitää tarjota lähtökohtaisesti yksinkertaista UI:ta, esimerkiksi drag n drop, Ryhmä hyökkää Ryhmän kimppuun tai jotain vastaavaa. Kuitenkin pitää antaa mahollisuus tehdä omia Custom Actioneita.

Lisää peliin Steam Workshop modi supportin, jossa pelaajat voi jakaa omia säännöstöjä. Pitää olla mahdollista myös antaa säännöille parametreja, jotta niitä on helpompi käyttää.

Potentiaalinen bugi: Eventit voi kiertää loopissa. Hahmo ilmottaa ryhmälle, ryhmä ilmoittaa hahmoille ja loop jatkuu. Tän voi estää sillä, että jos Hahmo/Ryhmä käsittelee saman eventID:n kahdesti niin siitä tulee virheilmoitus käyttäjälle. Tai ennen kuin sääntöä luodaan, niin tarkistetaan ettei tälläistä loopia voi syntyä.