---
creation date: '[[2025-06-16]]'
---
1. Ryhmä (ja niiden hierarkia)
2. Stats / traits / values
3. Eventit

Jokainen hahmo kuuluu johonkin ryhmään. Jokaisella hahmolla on ominaisuuksia (damage, health, violent...). Koko peli perustuu näiden palikoiden varaan. 

Sekä ryhmien että hahmojen pitää pystyä lähettämään sekä vastaanottamaan eventejä. Näiden avulla pystytään hallitsemaan hahmojen toimintaa.

Eventtien pitää olla peliobjekteja, koska niiden edistymistä täytyy seurata. Eventillä pitää olla "definition of done", mutta myös joku "timeout".

Eventit ja niiden aiheuttamat actionit menee hahmon/ryhmän queuen. Kun eventin aiheuttama action on tehty, niin hahmo/ryhmä käsittelee seuraavan jonossa.

Pitää olla mahdollista tyhjentää ryhmän tai hahmon event queue. Esim. Valtion uusi kuningas ei tykkää sodasta, niin se lähettää käskyn Armeijalle tulla kotiin (mitään ei tapahdu jos ollaan jo kotona). Tai hahmo tulee hulluksi, niin koko queue heitetään mäkeen ja hulluus alkaa sanelemaan uusia toimintoja.

Ryhmille pitää antaa eri tyyppejä kuten: nation, army, language, culture, secretive etc. Muuten menee hieman vaikeaksi esim siirtää valtioiden välillä hahmoja. On helpompaa sanoa `character.nation = A`, kun koittaa lotota mikähän niistä ryhmistä oli nyt valtio ja mikä ei. Tosin Hahmolla voi olla useita valtioita, kieliä ja oikeestaan mitä tahansa ryhmiä...

# Esimerkki #1
Jokaiselle hahmolle ja ryhmälle kuuluu statseja. Hahmo perii ryhmän statsit itselleen niihin liittyessään. Esim. hahmoa luodessa, sille ensin generoidaan random statsit jollain perusteella. Sitten lähtien alimman prioriteetin ryhmästä hahmo liittyy ryhmiin perien niiden statsit. Esimerkiksi

1. Valtio
	1. Ilmianna salaryhmät Valtiolle
2. Armeija
	1. Elinikä -25%
3. Klaani
	1. Väkivaltainen
4. Perhe
	1. 10 000 rahaa
	2. Elinikä +40%

Ensiksi hahmo saa 10 000 rahaa ja elinikä +40% (= 140). Sitten hän perii Klaanin väkivaltaisuuden. Kuitenkin liittyessä Armeijaan hänen elinikä muuttuu 140 -> 105. Ja viimeisenä hän saa itselleen Eventin, joka voisi toimia näin:

Hahmoa yritetään rekrytä salaseuraan. Hän kieltäytyy ja ilmoittaa siitä Valtiolle. Valtio käskee Ryhmää Salapoliisi tappamaan rekryäjän.

# Esimerkki #2
Ryhmä hierarkia:
1. Valtio
2. Klaani
3. Perhe

Valtio on ylin ryhmä, johon kuuluu klaaneja, johon kuuluu perheitä. Tässä yhteiskunnassa jokainen hahmo saa oletusarvoisesti tämän hierarkian. Se tarkoittaa, jos esimerkiksi Valtio päättää tuhota Perheen A, niin kaikki Valtion asukkaat yrittävät tappaa Perheen A, paitsi tietty ne hahmot jotka kuuluvat Perheeseen A. Eli jotakuinkin näin:
- Tappajat: `Hahmot where belongs to Valtio and NOT belongs to Perhe A`
- Kohde: `Hahmot where belongs to Perhe A`

Ja jokaisen Tappaja hahmon kohdalla tehdään ns. "lojaliteetti" tarkistus, jossa katotaan onko lojaliteetti Valtio > Perhe A totta.

Periaattessa vois olla myös:
- Tappajat: `Hahmot where belongs to Valtio`
joka johtaisi siihen, että Perhe A:n jäsenet tappaisivat toisiaan myös, koska ovat sokeasti lojaaleja Valtiolle. Kuitenkin tässä voi olla ongelmia 😁 Mutta riippuu miten yhteiskunnan säännöt menee... 😅 

# Esimerkki #3
Oletusarvoinen Ryhmä hierarkia asukkaalle:
1. Valtio A
2. Armeija
3. Klaani
4. Perhe

Kuitenkin joukolla hahmoja hierarkia onkin:
1. Valtio B
2. Klaani
3. Armeija
4. Valtio A
5. Perhe

Valtio A antaa käskyn Armeijalle, "Hyökätkää Valtio B:n kimppuun". Hahmot jotka kuuluvat Armeijaan (joilla on oletus hierarkia) hyökkäävät, koska Armeija > Valtio B (joka on undefined).

Kuitenkin joukko vakoojia, jotka ovat Armeijassa, mutta ovatkin Valtiosta B, eivät hyökkää, koska Valtio B > Armeija. Tässä tapauksessa Armeija, pois lukien nämä vakoojat, hyökkäävät Valtio B:n kimppuun.


# Esimerkki #4
Valtio B lähettää kaikille muille valtioille signaalin/eventin 
`"Valtion B:n sotavoima on 50"`

Valtio A:n arvoihin kuuluu `"Jos toisen valtion sotavoima on alle 60, hyökkää"`. Joten Valtio A tekee eventin 
`"Kuningas, määrää Armeija hyökkäämään Valtio B:tä kohtaan".`

Kuitenkin, Kuinkaan arvo on `violent: false`. Tämä johtaa siihen, ettei Armeijan lähde mihinkään. Valtion säännön voisi kirjottaa myös näin:

```
IF NATION power < 60 AND RULER violent==true
THEN ARMY attack NATION
ELSE ...
```

Jos maata johtaakin kuninkaan sijaan useita hallitsijoita, esim 5, niin sitten otetaan "keskiarvo", ja sen perusteella tulee TRUE tai FALSE `violent` arvolle. Jos keskiarvo on 50/50, niin siinä tapauksessa käytetään jotain muuta Valtion logiikkaa tai heitetään kolikkoa.


# Esimerkki #5
Hahmon (jatkossa Masa) perheenjäsen kuolee. Tämä tekee eventin "5% hahmo perustaa kultin". 5% menee maaliin ja tulee event:
`CHARACTER create GROUP. GROUP secretive=true priority=1`

Sitten siinä voi olla jotain muutakin yksityiskohtia ja arvoja jotka periytyy uusille ryhmän jäsenille, kuten väkivaltaisuus. Nyt kun Masa kuuluu salaseuraan, niin aika ajoin (esim. time based event) hahmo koittaa rekrytä jonkun ryhmäänsä jonkun statsin perusteella, esim raha.

Masa kokeilee rekrytä Hahmoa, koska hänellä on paljon rahaa. Tästä seuraa:
1. Hahmo liittyy
2. Hahmo ei liity, ei tee mitään, Masa ei tee mitään
3. Hahmo ei liity, ei tee mitään, Masa tekee jotain
4. Hahmo ei liity ja tekee jotain, Masa ei tee mitään
5. Hahmo ei liity ja tekee jotain, Masa tekee jotain

## Hahmo liittyy
Liittyessään Hahmo perii ryhmän statseja. Oletetaan, että Hahmo `violent=false`, mutta koska ryhmä on väkivaltainen, Hahmosta tulee myös väkivaltainen.
## Hahmo ei liity, ei tee mitään, Masa ei tee mitään
Mitään ei tapahdu. Kolikonheitto vain epäonnistui
## Hahmo ei liity, ei tee mitään, Masa tekee
Hahmo kieltäytyy, muttei tee mitään jatkotoimintoa. Masa kuitenkin tekee. Koska Masan ryhmä on väkivaltainen, niin Masa hyökkää Hahmon kimppuun. Muut statsit päättää lopputuloksen. Toinen kuolee, toinen ei.
## Hahmo ei liity ja tekee jotain, Masa ei tee mitään
Hahmo kieltäytyy, mutta koska ei ole väkivaltainen, niin hän ilmoittaa omalle #1 ryhmälle Masan kuuluvan salaseuraan Hakkaajat. Se mitä #1 ryhmä tekee, riippuu sen ryhmän säännöistä. Esim. he voivat tappaa Masan, tai tehdä ilmoituksen eteenpäin tai jotain muuta.
## Hahmo ei liity ja tekee jotain, Masa tekee jotain
Sama kuin edellisessä, mutta tällä kertaa Masa käy jälleen väkivaltaiseksi. Kuten tapauksessa 2, niin Hahmo reagoi samalla tavalla, esim juoksemalla karkuun tai lyömällä takaisin.

# Esimerkki #6
Eventtien toiminta.

Armeija saa eventin hyökätä Valtion kimppuun. Eventin DOD on "Valtion asukkaiden määrä on 0 (= tapettu tai muuta)". Tästä voi seurata muutama erilainen tapahtuma. On hyvä huomata, että Armeijalle voidaan lähettää 2 eventtiä: 1. Hyökkää 2. Palaa kotimaahan. Silloin kävipä hyökkäyksessä miten vain, niin kaikki Armeijan tyypit palaavat kotiin. Sen jälkeen kun kummatkin eventit 1 ja 2 on suoritettu, niin jatketaan uusien eventtien käsittelyä.
## Valtio antautuu
Valtio antautuu Armeijalle (tai sen Parentille). Jos Armeijalla on joku Event handler tälle, niin voisi tapahtua esim niin, että Valtion asukkaat siirtyvät Armeijan Parentille:
```
const characters = SELECT * from Characters where GROUP 'Valtio' exists
characters.forEach(char => char.nation = Isänmaa)
```

Jos Armeijalle ei oo Event handleria, niin lahtaaminen jatkuu.

## Timeout
Sodassa voi olla esim. 3 vuoden timeout. Koska armeija ei oo pääsyt päämäärään, hyökkäys lopetetaan ja palataan kotimaahan.

## DOD täyttyy
Kaikki Valtion asukkaat ovat tapetut, joten armeija palaa kotimaahan.

# Esimerkki #7
Hahmolla on seuraavat ryhmät:
1. Wizards (secretive)
2. Troops (army)
3. Elves (nation)
4. Slqkrq (language)
5. Manthis (family)

Hahmo joutuu sotaan, häviää sen ja sitten uusi valtio pakottaa uudet hierarkiat:
1. Wizards (secretive)
2. Troops (army)
3. Orcs (nation) <-- muuttui
4. Slqkrq (language)
5. Siansaksa (language) <-- uusi kieli
6. Manthis (family)

Pitäisiköhän olla mahdollisuus ettei Hahmo hyväksy uutta ryhmää? Ja siinä tapauksessa siirtää esimerkiksi ryhmään "Orkit haluaa tappaa"?